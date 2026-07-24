import { NextResponse } from "next/server";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { formatTime, toIsoDate } from "@/lib/attendance";
import * as XLSX from "xlsx";

interface AttendanceRow {
  id: number;
  date: string;
  timeIn: Date;
  expectedTimeOut: Date;
  timeOut: Date | null;
  targetDate: string;
  targetDutyTime: string | null;
  totalHours: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  undertimeHours: number | null;
  status: string;
  notes: string | null;
  location: string | null;
  employeeName: string;
  employeeCode: string;
  level: string;
  position: string;
  dutyTime: string | null;
}

function buildSummary(r: AttendanceRow): string {
  if (!r.timeOut) return "Shift In Progress (Logged In)";
  if (r.status === "OVERTIME") {
    return `Completed 8.0 hrs plus ${(r.overtimeHours || 0).toFixed(1)} hrs. OT`;
  }
  if (r.status === "UNDERTIME") {
    return `${(r.undertimeHours || 0).toFixed(1)} hrs. undertime (Worked ${(r.totalHours || 0).toFixed(1)} hrs)`;
  }
  return "Completed 8.0 hrs standard shift";
}

function mapRows(rows: AttendanceRow[]) {
  return rows.map((r) => ({
    "Attendance ID": r.id,
    "Log Target Date": r.targetDate || r.date,
    "Target Duty Time": r.targetDutyTime || "12:00 am",
    "Employee Code": r.employeeCode,
    "Employee Name": r.employeeName,
    Level: r.level,
    "Job Position": r.position,
    "Duty Time": r.dutyTime || "12:00 am",
    "Logged Date": r.date,
    "Time In": formatTime(r.timeIn),
    "Expected Time Out (8.0h)": formatTime(r.expectedTimeOut),
    "Time Out": r.timeOut ? formatTime(r.timeOut) : "--:-- (Still Logged In)",
    "Regular Hours": (r.regularHours || 0).toFixed(1),
    "Overtime Hours": (r.overtimeHours || 0).toFixed(1),
    "Undertime Hours": (r.undertimeHours || 0).toFixed(1),
    "Total Hours Worked": (r.totalHours || 0).toFixed(1),
    "Shift Status & Summary": buildSummary(r),
    Notes: r.notes || "",
  }));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "all";

    const baseSelect = {
      id: attendance.id,
      date: attendance.date,
      timeIn: attendance.timeIn,
      expectedTimeOut: attendance.expectedTimeOut,
      timeOut: attendance.timeOut,
      targetDate: attendance.targetDate,
      targetDutyTime: attendance.targetDutyTime,
      totalHours: attendance.totalHours,
      regularHours: attendance.regularHours,
      overtimeHours: attendance.overtimeHours,
      undertimeHours: attendance.undertimeHours,
      status: attendance.status,
      notes: attendance.notes,
      location: attendance.location,
      employeeName: employees.name,
      employeeCode: employees.employeeCode,
      level: employees.level,
      position: employees.position,
      dutyTime: employees.dutyTime,
    };

    const now = new Date();
    const todayStr = toIsoDate(now);

    const curr = new Date(now);
    const first = curr.getDate() - curr.getDay();
    const weekStart = toIsoDate(new Date(curr.getFullYear(), curr.getMonth(), first));
    const weekEnd = toIsoDate(new Date(curr.getFullYear(), curr.getMonth(), first + 6));

    const monthStr = todayStr.slice(0, 7);
    const monthStart = `${monthStr}-01`;
    const monthEnd = `${monthStr}-31`;

    const dailyRows = (await db
      .select(baseSelect)
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(eq(attendance.date, todayStr))
      .orderBy(desc(attendance.timeIn))) as AttendanceRow[];

    const weeklyRows = (await db
      .select(baseSelect)
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(and(gte(attendance.date, weekStart), lte(attendance.date, weekEnd)))
      .orderBy(desc(attendance.timeIn))) as AttendanceRow[];

    const monthlyRows = (await db
      .select(baseSelect)
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(and(gte(attendance.date, monthStart), lte(attendance.date, monthEnd)))
      .orderBy(desc(attendance.timeIn))) as AttendanceRow[];

    const allRows = (await db
      .select(baseSelect)
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .orderBy(desc(attendance.timeIn))) as AttendanceRow[];

    const workbook = XLSX.utils.book_new();

    const autoWidth = (sheet: XLSX.WorkSheet, data: unknown[]) => {
      if (data.length === 0) return;
      const keys = Object.keys((data as Record<string, unknown>[])[0]);
      sheet["!cols"] = keys.map((k) => ({ wch: Math.max(14, k.length + 2) }));
    };

    const dailyMapped = mapRows(dailyRows);
    const weeklyMapped = mapRows(weeklyRows);
    const monthlyMapped = mapRows(monthlyRows);
    const allMapped = mapRows(allRows);

    const dailySheet = XLSX.utils.json_to_sheet(
      dailyMapped.length ? dailyMapped : [{ Info: "No records for today (" + todayStr + ")" }]
    );
    const weeklySheet = XLSX.utils.json_to_sheet(
      weeklyMapped.length
        ? weeklyMapped
        : [{ Info: `No records for week ${weekStart} to ${weekEnd}` }]
    );
    const monthlySheet = XLSX.utils.json_to_sheet(
      monthlyMapped.length ? monthlyMapped : [{ Info: "No records for month " + monthStr }]
    );
    const allSheet = XLSX.utils.json_to_sheet(
      allMapped.length ? allMapped : [{ Info: "No attendance records found" }]
    );

    autoWidth(dailySheet, dailyMapped);
    autoWidth(weeklySheet, weeklyMapped);
    autoWidth(monthlySheet, monthlyMapped);
    autoWidth(allSheet, allMapped);

    XLSX.utils.book_append_sheet(workbook, dailySheet, "Everyday (Today)");
    XLSX.utils.book_append_sheet(workbook, weeklySheet, "Weekly");
    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly");
    XLSX.utils.book_append_sheet(workbook, allSheet, "All Records");

    const summarize = (label: string, rows: AttendanceRow[]) => ({
      Report: label,
      "Generated On": todayStr,
      "Total Log Records": rows.length,
      "Completed Shifts": rows.filter((r) => r.timeOut).length,
      "Currently Logged In": rows.filter((r) => !r.timeOut).length,
      "Total Regular Hours": rows.reduce((a, r) => a + (r.regularHours || 0), 0).toFixed(1),
      "Total Overtime Hours": rows.reduce((a, r) => a + (r.overtimeHours || 0), 0).toFixed(1),
      "Total Undertime Hours": rows.reduce((a, r) => a + (r.undertimeHours || 0), 0).toFixed(1),
      "Total Hours Worked": rows.reduce((a, r) => a + (r.totalHours || 0), 0).toFixed(1),
    });

    const summarySheet = XLSX.utils.json_to_sheet([
      summarize("Everyday / Today (" + todayStr + ")", dailyRows),
      summarize(`Weekly (${weekStart} to ${weekEnd})`, weeklyRows),
      summarize(`Monthly (${monthStr})`, monthlyRows),
      summarize("All Records", allRows),
    ]);
    summarySheet["!cols"] = [
      { wch: 32 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    // Standard ArrayBuffer format for standard web response
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const fileName =
      scope === "today"
        ? `GS_Attendance_Everyday_${todayStr}.xlsx`
        : scope === "weekly"
          ? `GS_Attendance_Weekly_${todayStr}.xlsx`
          : scope === "monthly"
            ? `GS_Attendance_Monthly_${monthStr}.xlsx`
            : `GS_Attendance_ALL_Daily_Weekly_Monthly_${todayStr}.xlsx`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
