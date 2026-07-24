import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees, attendance, breaks, auditTrail } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  calculateDutyShiftSummary,
  getExpectedDutyEnd,
  toAppIsoDate,
  formatTimeTz,
  computeLateMinutes,
  formatlate,
  getExpectedDutyStart,
  DUTY_SCHEDULE,
} from "@/lib/attendance";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      employeeCode,
      pin,
      action,
      notes,
      customTimeIn,
      customTimeOut,
      targetDate,
      ExpectedDutyTime,
    } = body;

    if (!employeeCode || !pin) {
      return NextResponse.json(
        { success: false, message: "Employee Code and PIN are required" },
        { status: 400 }
      );
    }

    // Find employee
    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.employeeCode, employeeCode.trim().toUpperCase()));

    if (!emp) {
      return NextResponse.json(
        { success: false, message: "Invalid Employee Code. Employee not found." },
        { status: 404 }
      );
    }

    if (emp.pin !== pin.trim()) {
      return NextResponse.json(
        { success: false, message: "Incorrect PIN. Verification failed." },
        { status: 401 }
      );
    }

    // Rule 2 enforcement: LOCKED accounts cannot log in or log out
    if (emp.accountStatus === "LOCKED") {
      return NextResponse.json(
        {
          success: false,
          locked: true,
          message:
            "Your account has been temporarily locked due to exceeding the allowable consecutive absences. Please contact your Administrator or Human Resources.",
          data: { accountStatus: "LOCKED", lockedAt: emp.lockedAt, lockReason: emp.lockReason },
        },
        { status: 403 }
      );
    }

    // Check for active session
    const openRecords = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, emp.id), isNull(attendance.timeOut)))
      .orderBy(desc(attendance.timeIn));

    const activeSession = openRecords.length > 0 ? openRecords[0] : null;

    // verify-only: just validates employeeCode + PIN + lock status (used by personal portal)
    if (action === "verify-only") {
      return NextResponse.json({
        success: true,
        action: "VERIFY_ONLY",
        message: "Credentials verified.",
        data: { employeeCode: emp.employeeCode, name: emp.name },
      });
    }

    if (action === "clock-in") {
      if (activeSession) {
        return NextResponse.json({
          success: false,
          message: `${emp.name} is ALREADY logged in since ${formatTimeTz(
            activeSession.timeIn
          )}. Expected clock-out is ${formatTimeTz(activeSession.expectedTimeOut)}. Please log out first.`,
          data: activeSession,
        });
      }

      const now = customTimeIn ? new Date(customTimeIn) : new Date();
      const todayIso = toAppIsoDate(now);

      // Logging Target Date from body, default to today
      const finalTargetDate = targetDate || todayIso;
      // Fallback target duty time: provided ExpectedDutyTime, employee profile expectedDutyTime, or default 12:00 am
      const finalTargetDutyTime =
        ExpectedDutyTime || emp.expectedDutyTime || emp.dutyTime || "12:00 am";

      // Late detection: actual log-in vs expected duty start on the target date
      const lateMinutes = computeLateMinutes(now, finalTargetDate, finalTargetDutyTime);

      // Scheduled duty window (fixed timeframe):
      //   12:00 am duty → ends 8:00 am | 2:00 am duty → ends 10:00 am | 3:00 am duty → ends 11:00 am
      const dutyStartUtc = getExpectedDutyStart(finalTargetDate, finalTargetDutyTime);
      const expectedOut = getExpectedDutyEnd(dutyStartUtc);
      const dutyWindowLabel =
        DUTY_SCHEDULE[finalTargetDutyTime]
          ? `${DUTY_SCHEDULE[finalTargetDutyTime].start} – ${DUTY_SCHEDULE[finalTargetDutyTime].end}`
          : `${finalTargetDutyTime} (+8.0 hrs)`;

      // Persistent LATE remark stamped on the record (visible in notes, tables & exports)
      const baseNote = notes ? notes.trim() : "Standard 8.0 hr shift started";
      const remarkNote =
        lateMinutes > 0
          ? `LATE (${formatlate(lateMinutes)} past ${formatTimeTz(dutyStartUtc)} duty start) — ${baseNote}`
          : baseNote;

      const [newRecord] = await db
        .insert(attendance)
        .values({
          employeeId: emp.id,
          date: todayIso,
          timeIn: now,
          expectedTimeOut: expectedOut,
          timeOut: null,
          targetDate: finalTargetDate,
          targetDutyTime: finalTargetDutyTime,
          lateMinutes,
          totalHours: 0,
          regularHours: 0,
          overtimeHours: 0,
          undertimeHours: 0,
          status: "LOGGED_IN",
          notes: remarkNote,
        })
        .returning();

      const lateNotice =
        lateMinutes > 0
          ? ` ⚠ LATE check-in: ${formatlate(lateMinutes)} (expected duty start ${formatTimeTz(
              dutyStartUtc
            )}).`
          : " ✅ On-time check-in.";

      return NextResponse.json({
        success: true,
        action: "LOG_IN",
        message: `Welcome, ${emp.name}! Logged IN at ${formatTimeTz(
          now
        )} for target date ${finalTargetDate} (Duty schedule: ${dutyWindowLabel}). Expected clock out: ${formatTimeTz(expectedOut)}.${lateNotice}`,
        data: {
          record: newRecord,
          employee: emp,
          timeInStr: formatTimeTz(now),
          expectedTimeOutStr: formatTimeTz(expectedOut),
        },
      });
    } else if (action === "clock-out") {
      if (!activeSession) {
        return NextResponse.json({
          success: false,
          message: `${emp.name} does not have an active clock-in session to log out from.`,
        });
      }

      // Rule: employees cannot log out while a break is active (admins are alerted)
      const activeBreakRows = await db
        .select()
        .from(breaks)
        .where(and(eq(breaks.employeeId, emp.id), eq(breaks.status, "ON_BREAK")));
      if (activeBreakRows.length > 0) {
        const br = activeBreakRows[0];
        await db.insert(auditTrail).values({
          actor: "System",
          action: "BREAK_VIOLATION_BLOCKED_LOGOUT",
          employeeCode: emp.employeeCode,
          details: `Log out blocked while ${br.breakType} (started ${new Date(br.startTime).toISOString()}) is still active — employee notified, admin alerted.`,
        });
        return NextResponse.json(
          {
            success: false,
            message: `${emp.name}, you cannot log out while your ${br.breakType} is active (started at ${formatTimeTz(br.startTime)}). Please tap "Done Break" first.`,
            data: { breakId: br.id, breakType: br.breakType, breakStartTime: br.startTime },
          },
          { status: 409 }
        );
      }

      const timeOut = customTimeOut ? new Date(customTimeOut) : new Date();
      const sessionDutyStart = getExpectedDutyStart(
        activeSession.targetDate,
        activeSession.targetDutyTime || "12:00 am"
      );
      const summary = calculateDutyShiftSummary(
        new Date(activeSession.timeIn as unknown as Date),
        timeOut,
        sessionDutyStart
      );

      // Preserve the LATE remark stamped at clock-in when an employee adds a logout note
      let logoutNote = activeSession.notes || "";
      if (notes) {
        const typed = notes.trim();
        if ((activeSession.lateMinutes || 0) > 0 && logoutNote.startsWith("LATE (")) {
          const remarkEnd = logoutNote.indexOf("—");
          logoutNote =
            remarkEnd > -1 ? `${logoutNote.slice(0, remarkEnd + 2).trimEnd()} ${typed}` : `LATE remark — ${typed}`;
        } else {
          logoutNote = typed;
        }
      }

      const [updatedRecord] = await db
        .update(attendance)
        .set({
          timeOut: timeOut,
          totalHours: summary.totalHours,
          regularHours: summary.regularHours,
          overtimeHours: summary.overtimeHours,
          undertimeHours: summary.undertimeHours,
          status: summary.status,
          updatedAt: new Date(),
          notes: logoutNote,
        })
        .where(eq(attendance.id, activeSession.id))
        .returning();

      let calcSummaryText = "";
      if (summary.status === "OVERTIME") {
        calcSummaryText = `Logged in ${formatTimeTz(
          activeSession.timeIn
        )} → expected out ${formatTimeTz(
          activeSession.expectedTimeOut
        )} → worked until ${formatTimeTz(timeOut)} = "Completed 8.0 hrs" plus ${summary.overtimeHours} hrs. OT`;
      } else if (summary.status === "HALF_DAY") {
        calcSummaryText = `Logged in ${formatTimeTz(
          activeSession.timeIn
        )} → expected out ${formatTimeTz(
          activeSession.expectedTimeOut
        )} → logged out at ${formatTimeTz(timeOut)} = Worked ${summary.totalHours} hrs = "Half Day"`;
      } else if (summary.status === "UNDERTIME") {
        calcSummaryText = `Logged in ${formatTimeTz(
          activeSession.timeIn
        )} → expected out ${formatTimeTz(
          activeSession.expectedTimeOut
        )} → logged out at ${formatTimeTz(timeOut)} = Worked ${summary.totalHours} hrs (${summary.undertimeHours} hrs. undertime)`;
      } else {
        calcSummaryText = `Logged in ${formatTimeTz(
          activeSession.timeIn
        )} → expected out ${formatTimeTz(
          activeSession.expectedTimeOut
        )} → logged out at ${formatTimeTz(timeOut)} = "Completed 8.0 hrs standard time"`;
      }

      return NextResponse.json({
        success: true,
        action: "LOG_OUT",
        message: `Goodbye, ${emp.name}! Logged OUT at ${formatTimeTz(
          timeOut
        )}. ${calcSummaryText}`,
        data: {
          record: updatedRecord,
          employee: emp,
          summary,
          calculationNotice: calcSummaryText,
        },
      });
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid action. Must be 'clock-in' or 'clock-out'" },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
