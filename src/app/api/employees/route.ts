import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { desc } from "drizzle-orm";
import { EMPLOYEE_REMARKS } from "@/lib/attendance";

export async function GET() {
  try {
    const list = await db.select().from(employees).orderBy(desc(employees.createdAt));
    return NextResponse.json({ success: true, data: list });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, level, position, pin, email, dutyTime, expectedDutyTime, dayOff, remark } = body;

    if (!name || !level || !position || !pin) {
      return NextResponse.json(
        { success: false, message: "Name, Level, Position, and PIN are required" },
        { status: 400 }
      );
    }

    // Select option lists
    const validLevels = ["Level A", "Level B", "Level C", "Level D"];
    const finalLevel = validLevels.includes(level) ? level : "Level A";

    const validPositions = ["Plotter", "ECG", "QC", "Adbust", "Page Checker"];
    const finalPosition = validPositions.includes(position) ? position : "Plotter";

    const validDutyTimes = ["12:00 am", "2:00 am", "3:00 am"];

    const finalDutyTime = dutyTime && validDutyTimes.includes(dutyTime) ? dutyTime : "12:00 am";
    const finalExpectedDutyTime = expectedDutyTime && validDutyTimes.includes(expectedDutyTime)
      ? expectedDutyTime
      : "12:00 am";

    // Validate Day Off selections (Monday–Sunday, multi-select)
    const validDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const finalDayOff = Array.isArray(dayOff)
      ? dayOff.filter((d) => typeof d === "string" && validDays.includes(d)).join(", ") || null
      : typeof dayOff === "string" && validDays.includes(dayOff)
        ? dayOff
        : null;

    // Validate Remark option list (Vacation Leave, Sick Leave, Emergency Leave,
    // Maternity Leave, Paternity Leave, Disconnected / ISP Issue, Power Interruption, Internet Maintenance)
    const finalRemark =
      typeof remark === "string" && EMPLOYEE_REMARKS.includes(remark) ? remark : null;

    const existing = await db.select().from(employees);
    const codeNum = 1000 + existing.length + 1;
    let employeeCode = `GS-${codeNum}`;

    let attempts = 0;
    while (existing.some((e) => e.employeeCode === employeeCode) && attempts < 50) {
      attempts++;
      employeeCode = `GS-${codeNum + attempts}`;
    }

    const avatarColors = [
      "bg-blue-600",
      "bg-emerald-600",
      "bg-indigo-600",
      "bg-purple-600",
      "bg-amber-600",
      "bg-rose-600",
      "bg-teal-600",
    ];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const [newEmployee] = await db
      .insert(employees)
      .values({
        employeeCode,
        name: name.trim(),
        level: finalLevel,
        position: finalPosition,
        pin: pin.trim(),
        email: email ? email.trim() : null,
        dutyTime: finalDutyTime,
        expectedDutyTime: finalExpectedDutyTime,
        dayOff: finalDayOff,
        remark: finalRemark,
        avatarColor,
        status: "Active",
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: `Employee ${newEmployee.name} registered successfully as ${newEmployee.employeeCode}`,
      data: newEmployee,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
