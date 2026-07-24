import { NextResponse } from "next/server";
import { db } from "@/db";
import { attendance, employees, employeeRemarks, breaks, warnings } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  calculateDutyShiftSummary,
  getExpectedDutyEnd,
  getExpectedDutyStart,
  computeLateMinutes,
  toAppIsoDate,
} from "@/lib/attendance";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const viewMode = searchParams.get("viewMode"); // today, weekly, monthly, custom, all
    const search = searchParams.get("search");
    const dateParam = searchParams.get("date"); // YYYY-MM-DD
    const monthParam = searchParams.get("month"); // YYYY-MM
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const conditions = [];

    if (employeeId && !isNaN(parseInt(employeeId, 10))) {
      conditions.push(eq(attendance.employeeId, parseInt(employeeId, 10)));
    }

    const now = new Date();
    const todayAppIso = toAppIsoDate(now);
    if (viewMode === "today" || dateParam) {
      const targetDate = dateParam || todayAppIso;
      conditions.push(eq(attendance.date, targetDate));
    } else if (viewMode === "weekly") {
      // Week boundary computed in the app timezone (Sun - Sat of the local week)
      const shiftMs = 8 * 60 * 60 * 1000;
      const base = dateParam
        ? new Date(`${dateParam}T00:00:00Z`)
        : new Date(now.getTime() + shiftMs);
      const dayOfWeek = base.getUTCDay();
      const firstDayMs = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - dayOfWeek);
      const lastDayMs = firstDayMs + 6 * 24 * 60 * 60 * 1000;
      const firstDay = toAppIsoDate(new Date(firstDayMs - shiftMs));
      const lastDay = toAppIsoDate(new Date(lastDayMs - shiftMs));

      conditions.push(gte(attendance.date, firstDay));
      conditions.push(lte(attendance.date, lastDay));
    } else if (viewMode === "monthly" || monthParam) {
      const targetMonth = monthParam || todayAppIso.slice(0, 7);
      const startOfMonth = `${targetMonth}-01`;
      const endOfMonth = `${targetMonth}-31`;

      conditions.push(gte(attendance.date, startOfMonth));
      conditions.push(lte(attendance.date, endOfMonth));
    } else if (startDateParam && endDateParam) {
      conditions.push(gte(attendance.date, startDateParam));
      conditions.push(lte(attendance.date, endDateParam));
    }

    const query = db
      .select({
        id: attendance.id,
        employeeId: attendance.employeeId,
        date: attendance.date,
        timeIn: attendance.timeIn,
        expectedTimeOut: attendance.expectedTimeOut,
        timeOut: attendance.timeOut,
        targetDate: attendance.targetDate,
        targetDutyTime: attendance.targetDutyTime,
        lateMinutes: attendance.lateMinutes,
        totalHours: attendance.totalHours,
        regularHours: attendance.regularHours,
        overtimeHours: attendance.overtimeHours,
        undertimeHours: attendance.undertimeHours,
        status: attendance.status,
        notes: attendance.notes,
        location: attendance.location,
        createdAt: attendance.createdAt,
        updatedAt: attendance.updatedAt,
        employeeName: employees.name,
        employeeCode: employees.employeeCode,
        level: employees.level,
        position: employees.position,
        dutyTime: employees.dutyTime,
        expectedDutyTime: employees.expectedDutyTime,
        employeeRemark: employees.remark,
        accountStatus: employees.accountStatus,
        avatarColor: employees.avatarColor,
      })
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .orderBy(desc(attendance.timeIn));

    let results;
    if (conditions.length > 0) {
      results = await query.where(and(...conditions));
    } else {
      results = await query;
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(
        (item) =>
          item.employeeName.toLowerCase().includes(q) ||
          item.employeeCode.toLowerCase().includes(q) ||
          item.level.toLowerCase().includes(q) ||
          item.position.toLowerCase().includes(q)
      );
    }

    // Merge warning email-sent status per employee
    const allWarnings = await db.select().from(warnings);
    const warningByEmp = new Map<number, { emailSent: boolean; warningNo: string }>();
    for (const w of allWarnings) {
      const prev = warningByEmp.get(w.employeeId);
      if (!prev || w.id > (prev as any)._id) {
        warningByEmp.set(w.employeeId, { emailSent: w.emailSent, warningNo: w.warningNo, _id: w.id } as any);
      }
    }

    // Merge calendar-marked daily remarks onto each attendance row so the remark
    // marked on that specific day is recorded on the active employee's record.
    const dailyMarks = await db.select().from(employeeRemarks);
    const dayMarkMap = new Map<string, string>();
    for (const m of dailyMarks) {
      dayMarkMap.set(`${m.employeeId}|${m.date}`, m.remark);
    }

    // Merge total break time per employee+day (completed breaks plus live on-break minutes)
    const allBreaks = await db.select().from(breaks);
    const breakMinutesMap = new Map<string, number>();
    const nowMs = Date.now();
    for (const b of allBreaks) {
      const key = `${b.employeeId}|${b.date}`;
      const mins =
        b.status === "DONE"
          ? b.durationMinutes || 0
          : Math.max(0, (nowMs - new Date(b.startTime).getTime()) / 60000);
      breakMinutesMap.set(key, (breakMinutesMap.get(key) || 0) + mins);
    }

    const enriched = results.map((r) => {
      const warnInfo = warningByEmp.get(r.employeeId);
      return {
        ...r,
        dailyRemark:
          (r.targetDate ? dayMarkMap.get(`${r.employeeId}|${r.targetDate}`) : undefined) ||
          dayMarkMap.get(`${r.employeeId}|${r.date}`) ||
          null,
        breakMinutes:
          (r.targetDate ? breakMinutesMap.get(`${r.employeeId}|${r.targetDate}`) : undefined) ??
          breakMinutesMap.get(`${r.employeeId}|${r.date}`) ??
          0,
        emailSentStatus: warnInfo ? (warnInfo.emailSent ? "Yes" : "No") : null,
        warningNo: warnInfo ? warnInfo.warningNo : null,
      };
    });

    return NextResponse.json({ success: true, count: enriched.length, data: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeId, timeIn, timeOut, notes, location, targetDate, targetDutyTime } = body;

    if (!employeeId || (!timeIn && !timeOut)) {
      return NextResponse.json(
        { success: false, message: "Employee ID and at least a Time In or Time Out are required" },
        { status: 400 }
      );
    }

    const tIn = timeIn ? new Date(timeIn) : null;
    const tOut = timeOut ? new Date(timeOut) : null;
    const dateStr = toAppIsoDate(tIn || tOut || new Date());

    const finalTargetDate = targetDate || dateStr;
    const finalTargetDutyTime = targetDutyTime || "12:00 am";
    const dutyStartUtc = getExpectedDutyStart(finalTargetDate, finalTargetDutyTime);
    const expectedOut = getExpectedDutyEnd(dutyStartUtc);

    // Missing Log In record (logout exists but login missing) → Incomplete Attendance
    const summary =
      tIn === null
        ? {
            totalHours: 0,
            regularHours: 0,
            overtimeHours: 0,
            undertimeHours: 0,
            status: "INCOMPLETE" as const,
            displayText: "Incomplete Attendance — Missing Log In",
          }
        : calculateDutyShiftSummary(tIn as Date, tOut, dutyStartUtc);
    const lateMinutes = tIn ? computeLateMinutes(tIn, finalTargetDate, finalTargetDutyTime) : 0;

    const [newRecord] = await db
      .insert(attendance)
      .values({
        employeeId: parseInt(employeeId, 10),
        date: dateStr,
        timeIn: tIn,
        expectedTimeOut: expectedOut,
        timeOut: tOut,
        targetDate: finalTargetDate,
        targetDutyTime: finalTargetDutyTime,
        lateMinutes,
        totalHours: summary.totalHours,
        regularHours: summary.regularHours,
        overtimeHours: summary.overtimeHours,
        undertimeHours: summary.undertimeHours,
        status: summary.status,
        notes: notes || (tIn === null ? "Manual entry — Missing Log In" : "Manual entry"),
        location: location || "Main Office",
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: "Attendance entry added successfully",
      data: newRecord,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
