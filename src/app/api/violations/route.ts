import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees, attendance, employeeRemarks, warnings, auditTrail } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { toAppIsoDate } from "@/lib/attendance";
import nodemailer from "nodemailer";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const APP_OFFSET_MS = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? 8 * 60) * 60000;
const MAX_LOOKBACK_DAYS = 30;

const LOCK_MESSAGE =
  "Your account has been temporarily locked due to exceeding the allowable consecutive absences. Please contact your Administrator or Human Resources.";

function appDayIso(d: Date): string {
  return toAppIsoDate(d);
}

function buildTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function warningEmailSubject() {
  return "Attendance Warning Notice – Three Consecutive Absences";
}

function warningEmailBody(employeeName: string, absentDates: string[]): string {
  return `Dear ${employeeName},

Our attendance monitoring system has detected that you have been absent for three (3) consecutive scheduled workdays.

Attendance Dates:
${absentDates.join("\n")}

As required by company policy, a Verbal/Written Warning has been issued.
Please contact your supervisor or Human Resources immediately to explain your absence and provide any required documentation.
Failure to report or continued unauthorized absences may result in additional disciplinary action, including temporary account suspension.

- GS Log In/Log Out Monitoring System (Automated Notice)`;
}

export async function GET() {
  try {
    const nowUtcMs = Date.now();
    const appNow = new Date(nowUtcMs + APP_OFFSET_MS);
    const todayIso = appDayIso(new Date(nowUtcMs));
    const currentYear = String(appNow.getUTCFullYear());

    const allEmployees = await db.select().from(employees);
    const allAttendance = await db
      .select({ employeeId: attendance.employeeId, date: attendance.date })
      .from(attendance);
    const allMarks = await db
      .select({ employeeId: employeeRemarks.employeeId, date: employeeRemarks.date })
      .from(employeeRemarks);
    const existingWarnings = await db.select().from(warnings).orderBy(desc(warnings.createdAt));
    const audits = await db.select().from(auditTrail).orderBy(desc(auditTrail.createdAt)).limit(15);

    const attendanceByEmp = new Map<number, Set<string>>();
    for (const a of allAttendance) {
      if (!attendanceByEmp.has(a.employeeId)) attendanceByEmp.set(a.employeeId, new Set());
      attendanceByEmp.get(a.employeeId)!.add(a.date);
    }
    const marksByEmp = new Map<number, Set<string>>();
    for (const m of allMarks) {
      if (!marksByEmp.has(m.employeeId)) marksByEmp.set(m.employeeId, new Set());
      marksByEmp.get(m.employeeId)!.add(m.date);
    }

    const results: any[] = [];

    for (const emp of allEmployees) {
      if (emp.status !== "Active") {
        results.push({});
        continue;
      }

      const attSet = attendanceByEmp.get(emp.id) || new Set<string>();
      const markSet = marksByEmp.get(emp.id) || new Set<string>();
      const dayOffIdx = new Set(
        (emp.dayOff || "")
          .split(",")
          .map((d) => WEEKDAY_NAMES.indexOf(d.trim()))
          .filter((i) => i >= 0)
      );

      // Count absences walking backwards from yesterday (app timezone); today doesn't count yet.
      // Days before the employee joined are not counted (streak capped).
      let absentDays: string[] = [];
      if (!attSet.has(todayIso)) {
        const joinedUtcDay = Date.UTC(
          appNow.getUTCFullYear(),
          appNow.getUTCMonth(),
          appNow.getUTCDate()
        );
        const createdDay = emp.createdAt
          ? Date.UTC(
              new Date(emp.createdAt).getUTCFullYear(),
              new Date(emp.createdAt).getUTCMonth(),
              new Date(emp.createdAt).getUTCDate()
            )
          : joinedUtcDay;
        const earliest = Math.max(createdDay, joinedUtcDay - MAX_LOOKBACK_DAYS * 86400000);

        for (let back = 1; back <= MAX_LOOKBACK_DAYS; back++) {
          const dayMs = joinedUtcDay - back * 86400000;
          if (dayMs < earliest) break;
          const dayUtc = new Date(dayMs);
          const dow = dayUtc.getUTCDay();
          if (dayOffIdx.has(dow)) continue; // scheduled rest day — not a workday

          const iso = `${dayUtc.getUTCFullYear()}-${String(dayUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(dayUtc.getUTCDate()).padStart(2, "0")}`;
          if (attSet.has(iso) || markSet.has(iso)) break; // presence or approved justification ends streak
          absentDays.push(iso);
        }
      }

      const streak = absentDays.length;
      const anchorDate = absentDays[0] || null;

      // ---- Rule 1: 3 consecutive absences → auto Warning Notice + Email ----
      let warningForStreak =
        anchorDate != null
          ? existingWarnings.find(
              (w) => w.employeeId === emp.id && w.anchorDate === anchorDate
            ) || null
          : null;

      if (streak >= 3 && anchorDate && (!warningForStreak || warningForStreak.consecutiveCount < streak)) {
        // Escalate an existing warning if the streak grew
        const existingStreakWarning = existingWarnings.find(
          (w) => w.employeeId === emp.id && w.absentDates.split(",")[0] !== undefined && w.anchorDate === anchorDate
        );
        const level = streak >= 4 ? "Final Written Warning" : "Written Warning";
        const reason =
          "You have been absent for three (3) consecutive scheduled workdays without approved leave or authorized justification.";

        if (!warningForStreak) {
          const warningNo = `WN-${currentYear}-${String(existingWarnings.length + 1).padStart(4, "0")}`;
          // Email (best-effort; recorded either way)
          let emailSent = false;
          let emailError: string | null = null;
          if (emp.email) {
            const transporter = buildTransporter();
            if (transporter) {
              try {
                await transporter.sendMail({
                  from: process.env.SMTP_FROM || process.env.SMTP_USER,
                  to: emp.email,
                  subject: warningEmailSubject(),
                  text: warningEmailBody(emp.name, absentDays),
                });
                emailSent = true;
              } catch (e: unknown) {
                emailError = e instanceof Error ? e.message : "SMTP send failed";
              }
            } else {
              emailError = "Gmail not configured (set SMTP_USER and SMTP_PASS)";
            }
          } else {
            emailError = "No registered email address";
          }

          const [record] = await db
            .insert(warnings)
            .values({
              warningNo,
              employeeId: emp.id,
              employeeCode: emp.employeeCode,
              employeeName: emp.name,
              empLevel: emp.level,
              position: emp.position,
              supervisor: null,
              absentDates: absentDays.join(", "),
              anchorDate,
              consecutiveCount: streak,
              warningLevel: level,
              reason,
              emailSent,
              emailError,
              issuedBy: "System",
            })
            .returning();
          warningForStreak = record;
          existingWarnings.unshift(record);
          await db.insert(auditTrail).values({
            actor: "System",
            action: "AUTO_WARNING_ISSUED",
            employeeCode: emp.employeeCode,
            details: `Warning ${warningNo} issued for ${streak} consecutive absence(s) (${absentDays.join(", ")}). Email: ${emailSent ? "sent" : `not sent (${emailError})`}.`,
          });
        } else if (warningForStreak && warningForStreak.consecutiveCount < streak) {
          const [updated] = await db
            .update(warnings)
            .set({
              consecutiveCount: streak,
              absentDates: absentDays.join(", "),
              warningLevel: level,
            })
            .where(eq(warnings.id, warningForStreak.id))
            .returning();
          warningForStreak = updated;
          const idx = existingWarnings.findIndex((w) => w.id === updated.id);
          if (idx >= 0) existingWarnings[idx] = updated;
        }
      }

      // ---- Rule 2: 4 consecutive absences → auto lock ----
      let accountStatus = emp.accountStatus;
      let lockedAt = emp.lockedAt;
      if (streak >= 4 && accountStatus !== "LOCKED") {
        const nowDate = new Date();
        const reason = `Exceeded allowable consecutive absences (${streak} consecutive missed workdays: ${absentDays.join(", ")}).`;
        const [upd] = await db
          .update(employees)
          .set({
            accountStatus: "LOCKED",
            lockedAt: nowDate,
            lockReason: reason,
            unlockReason: null,
            unlockAdmin: null,
            unlockedAt: null,
          })
          .where(eq(employees.id, emp.id))
          .returning();
        accountStatus = upd.accountStatus;
        lockedAt = upd.lockedAt;
        emp.accountStatus = "LOCKED";
        await db.insert(auditTrail).values({
          actor: "System",
          action: "AUTO_LOCK_ACCOUNT",
          employeeCode: emp.employeeCode,
          details: `Account auto-locked: ${reason}`,
        });
      }

      const warningLevelLabel =
        streak >= 4 ? "Final Written Warning" : streak === 3 ? "Written Warning" : streak === 2 ? "Monitoring" : "Normal";
      const rowColor = streak >= 4 ? "red" : streak === 3 ? "orange" : streak === 2 ? "yellow" : "green";

      results.push({
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        level: emp.level,
        position: emp.position,
        email: emp.email,
        supervisor: null,
        consecutiveAbsentDays: streak,
        totalMissedDays: streak,
        warningLevel: warningLevelLabel,
        rowColor,
        warning: warningForStreak,
        warningHistoryCount: existingWarnings.filter((w) => w.employeeId === emp.id).length,
        emailSent: warningForStreak ? warningForStreak.emailSent : null,
        emailError: warningForStreak ? warningForStreak.emailError : null,
        accountStatus,
        lockedAt,
        lockReason: emp.lockReason,
        unlockReason: emp.unlockReason,
        unlockAdmin: emp.unlockAdmin,
        unlockedAt: emp.unlockedAt,
        absentDates: absentDays,
      });
    }

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      lockMessage: LOCK_MESSAGE,
      data: results,
      audits,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
