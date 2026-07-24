import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees, attendance, breaks, breakPolicies } from "@/db/schema";
import { eq, and, isNull, desc, gte, lte } from "drizzle-orm";
import { toAppIsoDate, formatTimeTz } from "@/lib/attendance";

const DEFAULT_POLICY = {
  mealsCount: 1,
  mealMinutes: 60,
  mealPaid: false,
  coffeeCount: 2,
  coffeeMinutes: 15,
  coffeePaid: true,
  graceMinutes: 5,
  mealRequired: false,
};

async function loadPolicy() {
  const rows = await db.select().from(breakPolicies).limit(1);
  if (rows.length === 0) return { id: null, ...DEFAULT_POLICY };
  const { id, mealsCount, mealMinutes, mealPaid, coffeeCount, coffeeMinutes, coffeePaid, graceMinutes, mealRequired } = rows[0];
  return { id, mealsCount, mealMinutes, mealPaid, coffeeCount, coffeeMinutes, coffeePaid, graceMinutes, mealRequired };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const employeeCode = searchParams.get("employeeCode");
    const dateParam = searchParams.get("date"); // default = today (app local)
    const monthParam = searchParams.get("month");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const conditions = [];
    if (employeeId && !isNaN(parseInt(employeeId, 10))) {
      conditions.push(eq(breaks.employeeId, parseInt(employeeId, 10)));
    } else if (employeeCode) {
      const [emp] = await db
        .select()
        .from(employees)
        .where(eq(employees.employeeCode, employeeCode.trim().toUpperCase()));
      if (!emp) return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
      conditions.push(eq(breaks.employeeId, emp.id));
    }

    if (dateParam) conditions.push(eq(breaks.date, dateParam));
    else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      conditions.push(gte(breaks.date, `${monthParam}-01`));
      conditions.push(lte(breaks.date, `${monthParam}-31`));
    } else if (startDate && endDate) {
      conditions.push(gte(breaks.date, startDate));
      conditions.push(lte(breaks.date, endDate));
    } else {
      conditions.push(eq(breaks.date, toAppIsoDate(new Date())));
    }

    const rows = await db
      .select({
        id: breaks.id,
        employeeId: breaks.employeeId,
        attendanceId: breaks.attendanceId,
        date: breaks.date,
        breakType: breaks.breakType,
        startTime: breaks.startTime,
        endTime: breaks.endTime,
        durationMinutes: breaks.durationMinutes,
        status: breaks.status,
        violation: breaks.violation,
        location: breaks.location,
        deviceName: breaks.deviceName,
        ipAddress: breaks.ipAddress,
        overriddenAt: breaks.overriddenAt,
        overrideReason: breaks.overrideReason,
        overrideBy: breaks.overrideBy,
        createdAt: breaks.createdAt,
        employeeName: employees.name,
        employeeCode: employees.employeeCode,
        level: employees.level,
        position: employees.position,
        avatarColor: employees.avatarColor,
      })
      .from(breaks)
      .innerJoin(employees, eq(breaks.employeeId, employees.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(breaks.startTime));

    const policy = await loadPolicy();
    const onBreakRows = await db
      .select({ employeeId: breaks.employeeId })
      .from(breaks)
      .where(eq(breaks.status, "ON_BREAK"));

    return NextResponse.json({
      success: true,
      count: rows.length,
      data: rows,
      policy,
      onBreakEmployeeIds: onBreakRows.map((r) => r.employeeId),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeCode, pin, action, breakType = "Coffee Break", location } = body;
    const customTime = body.customTime ? new Date(body.customTime) : null;

    if (!employeeCode || !pin) {
      return NextResponse.json({ success: false, message: "Employee Code and PIN are required" }, { status: 400 });
    }
    if (action !== "start" && action !== "end") {
      return NextResponse.json({ success: false, message: "Action must be 'start' or 'end'" }, { status: 400 });
    }
    if (!["Meal Break", "Coffee Break"].includes(breakType)) {
      return NextResponse.json({ success: false, message: "Invalid break type" }, { status: 400 });
    }

    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.employeeCode, employeeCode.trim().toUpperCase()));
    if (!emp) return NextResponse.json({ success: false, message: "Invalid Employee Code. Employee not found." }, { status: 404 });
    if (emp.pin !== pin.trim()) {
      return NextResponse.json({ success: false, message: "Incorrect PIN. Verification failed." }, { status: 401 });
    }
    if (emp.accountStatus === "LOCKED") {
      return NextResponse.json(
        {
          success: false,
          locked: true,
          message:
            "Your account has been temporarily locked due to exceeding the allowable consecutive absences. Please contact your Administrator or Human Resources.",
        },
        { status: 403 }
      );
    }

    // Must be logged in (open attendance session) to manage breaks
    const openShifts = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, emp.id), isNull(attendance.timeOut)))
      .orderBy(desc(attendance.timeIn));
    if (openShifts.length === 0) {
      return NextResponse.json({
        success: false,
        message: `${emp.name} is not logged in. ${action === "start" ? "Start Break" : "End Break"} is only available while logged in.`,
      });
    }
    const shift = openShifts[0];

    const now = customTime || new Date();
    const todayIso = toAppIsoDate(now);
    const policy = await loadPolicy();
    const typeCfg =
      breakType === "Meal Break"
        ? { count: policy.mealsCount, minutes: policy.mealMinutes, paid: policy.mealPaid }
        : { count: policy.coffeeCount, minutes: policy.coffeeMinutes, paid: policy.coffeePaid };
    const allowedMinutes = typeCfg.minutes + policy.graceMinutes;

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const deviceName = body.deviceName || req.headers.get("user-agent")?.slice(0, 120) || null;

    if (action === "start") {
      // Rule: cannot start another break until the current break has been ended
      const activeBreaks = await db
        .select()
        .from(breaks)
        .where(and(eq(breaks.employeeId, emp.id), eq(breaks.status, "ON_BREAK")));
      if (activeBreaks.length > 0) {
        return NextResponse.json({
          success: false,
          message: `${emp.name} already has an active ${activeBreaks[0].breakType} (started ${formatTimeTz(activeBreaks[0].startTime)}). End the current break before starting another.`,
          data: activeBreaks[0],
        });
      }

      // Multiple-unauthorized-break detection (alerts, still recorded)
      const todaysType = await db
        .select()
        .from(breaks)
        .where(and(eq(breaks.employeeId, emp.id), eq(breaks.date, todayIso), eq(breaks.breakType, breakType)));
      const violation =
        todaysType.length >= typeCfg.count
          ? `Unauthorized extra ${breakType} (${todaysType.length} of ${typeCfg.count} allowed already used)`
          : null;

      const [record] = await db
        .insert(breaks)
        .values({
          employeeId: emp.id,
          attendanceId: shift.id,
          date: todayIso,
          breakType,
          startTime: now,
          endTime: null,
          durationMinutes: 0,
          status: "ON_BREAK",
          violation,
          location: location || null,
          deviceName,
          ipAddress: clientIp,
        })
        .returning();

      return NextResponse.json({
        success: true,
        action: "START_BREAK",
        message: `You are now on break. (${breakType} started at ${formatTimeTz(now)}, allowance ${typeCfg.minutes} min + ${policy.graceMinutes} min grace${violation ? ` — ALERT: ${violation}` : ""})`,
        data: record,
        alert: violation,
      });
    }

    // action === "end"
    const activeBreaks = await db
      .select()
      .from(breaks)
      .where(
        and(
          eq(breaks.employeeId, emp.id),
          eq(breaks.status, "ON_BREAK"),
          eq(breaks.breakType, breakType)
        )
      );
    let activeBreak = activeBreaks[0];
    if (!activeBreak) {
      const anyActive = await db
        .select()
        .from(breaks)
        .where(and(eq(breaks.employeeId, emp.id), eq(breaks.status, "ON_BREAK")));
      if (anyActive.length > 0) activeBreak = anyActive[0];
    }
    if (!activeBreak) {
      return NextResponse.json({
        success: false,
        message: `${emp.name} has no active break to end. Start Break first.`,
      });
    }

    const durationMs = now.getTime() - new Date(activeBreak.startTime).getTime();
    const durationMinutes = Math.max(0, Math.round((durationMs / 60000) * 10) / 10);
    const exceededBy = Math.max(0, Math.round((durationMinutes - allowedMinutes) * 10) / 10);
    const activeTypeCfg =
      activeBreak.breakType === "Meal Break"
        ? { count: policy.mealsCount, minutes: policy.mealMinutes, paid: policy.mealPaid }
        : { count: policy.coffeeCount, minutes: policy.coffeeMinutes, paid: policy.coffeePaid };
    const activeAllowed = activeTypeCfg.minutes + policy.graceMinutes;
    const activeExceededBy = Math.max(0, Math.round((durationMinutes - activeAllowed) * 10) / 10);

    const violations: string[] = [];
    if (activeBreak.violation) violations.push(activeBreak.violation);
    if (activeExceededBy > 0) {
      violations.push(`Employee exceeded the allowed break time by ${activeExceededBy} minutes`);
    }
    const violationText = violations.length > 0 ? violations.join("; ") : null;

    const [updated] = await db
      .update(breaks)
      .set({
        endTime: now,
        durationMinutes,
        status: "DONE",
        violation: violationText,
        updatedAt: new Date(),
      })
      .where(eq(breaks.id, activeBreak.id))
      .returning();

    return NextResponse.json({
      success: true,
      action: "END_BREAK",
      message: `Break ended successfully. Welcome back. Total Break: ${durationMinutes} min (${(durationMinutes / 60).toFixed(2)} hrs).${activeExceededBy > 0 ? ` ALERT: Employee exceeded the allowed break time by ${activeExceededBy} minutes.` : ""}`,
      data: updated,
      alert: activeExceededBy > 0 ? `Employee exceeded the allowed break time by ${activeExceededBy} minutes` : violationText,
      totals: {
        minutes: durationMinutes,
        hours: Math.round((durationMinutes / 60) * 100) / 100,
        allowedMinutes: activeAllowed,
        exceededBy: activeExceededBy,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
