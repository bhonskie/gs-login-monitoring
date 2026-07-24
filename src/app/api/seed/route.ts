import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees, attendance } from "@/db/schema";
import { calculateDutyShiftSummary, getExpectedDutyEnd, getExpectedDutyStart, toIsoDate } from "@/lib/attendance";

export async function POST() {
  try {
    const existingEmployees = await db.select().from(employees);
    if (existingEmployees.length > 0) {
      return NextResponse.json({
        success: true,
        message: "Database already contains employees.",
        count: existingEmployees.length,
      });
    }

    const seedEmployees = [
      {
        employeeCode: "GS-1001",
        name: "Juan Dela Cruz",
        level: "Level A",
        position: "Plotter",
        pin: "1234",
        email: "juan.delacruz@gslogistics.com",
        dutyTime: "12:00 am",
        expectedDutyTime: "12:00 am",
        avatarColor: "bg-blue-600",
      },
      {
        employeeCode: "GS-1002",
        name: "Maria Santos",
        level: "Level B",
        position: "ECG",
        pin: "2345",
        email: "maria.santos@gslogistics.com",
        dutyTime: "2:00 am",
        expectedDutyTime: "2:00 am",
        avatarColor: "bg-emerald-600",
      },
      {
        employeeCode: "GS-1003",
        name: "Carlos Reyes",
        level: "Level A",
        position: "QC",
        pin: "3456",
        email: "carlos.reyes@gslogistics.com",
        dutyTime: "3:00 am",
        expectedDutyTime: "3:00 am",
        avatarColor: "bg-purple-600",
      },
      {
        employeeCode: "GS-1004",
        name: "Ana Gonzales",
        level: "Level C",
        position: "Adbust",
        pin: "4567",
        email: "ana.gonzales@gslogistics.com",
        dutyTime: "12:00 am",
        expectedDutyTime: "3:00 am",
        avatarColor: "bg-amber-600",
      },
      {
        employeeCode: "GS-1005",
        name: "David Lim",
        level: "Level D",
        position: "Page Checker",
        pin: "5678",
        email: "david.lim@gslogistics.com",
        dutyTime: "2:00 am",
        expectedDutyTime: "2:00 am",
        avatarColor: "bg-teal-600",
      },
    ];

    const insertedEmps = await db.insert(employees).values(seedEmployees).returning();

    const today = new Date();
    const todayStr = toIsoDate(today);

    const juan = insertedEmps.find((e) => e.employeeCode === "GS-1001")!;
    const juanIn = new Date(`${todayStr}T07:00:00`);
    const juanOut = new Date(`${todayStr}T17:00:00`);
    const juanDuty = getExpectedDutyStart(todayStr, juan.expectedDutyTime || "12:00 am");
    const juanCalc = calculateDutyShiftSummary(juanIn, juanOut, juanDuty);

    const maria = insertedEmps.find((e) => e.employeeCode === "GS-1002")!;
    const mariaIn = new Date(`${todayStr}T07:00:00`);
    const mariaOut = new Date(`${todayStr}T11:00:00`);
    const mariaDuty = getExpectedDutyStart(todayStr, maria.expectedDutyTime || "12:00 am");
    const mariaCalc = calculateDutyShiftSummary(mariaIn, mariaOut, mariaDuty);

    const carlos = insertedEmps.find((e) => e.employeeCode === "GS-1003")!;
    const carlosIn = new Date(`${todayStr}T08:00:00`);
    const carlosOut = new Date(`${todayStr}T16:00:00`);
    const carlosDuty = getExpectedDutyStart(todayStr, carlos.expectedDutyTime || "12:00 am");
    const carlosCalc = calculateDutyShiftSummary(carlosIn, carlosOut, carlosDuty);

    const ana = insertedEmps.find((e) => e.employeeCode === "GS-1004")!;
    const anaIn = new Date(`${todayStr}T08:30:00`);
    const anaDuty = getExpectedDutyStart(todayStr, ana.expectedDutyTime || "12:00 am");

    const attendanceList = [
      {
        employeeId: juan.id,
        date: todayStr,
        timeIn: juanIn,
        expectedTimeOut: getExpectedDutyEnd(juanDuty),
        timeOut: juanOut,
        targetDate: todayStr,
        targetDutyTime: juan.expectedDutyTime || "12:00 am",
        totalHours: juanCalc.totalHours,
        regularHours: juanCalc.regularHours,
        overtimeHours: juanCalc.overtimeHours,
        undertimeHours: juanCalc.undertimeHours,
        status: juanCalc.status,
        notes: "Shift overtime",
      },
      {
        employeeId: maria.id,
        date: todayStr,
        timeIn: mariaIn,
        expectedTimeOut: getExpectedDutyEnd(mariaDuty),
        timeOut: mariaOut,
        targetDate: todayStr,
        targetDutyTime: maria.expectedDutyTime || "2:00 am",
        totalHours: mariaCalc.totalHours,
        regularHours: mariaCalc.regularHours,
        overtimeHours: mariaCalc.overtimeHours,
        undertimeHours: mariaCalc.undertimeHours,
        status: mariaCalc.status,
        notes: "Early logout",
      },
      {
        employeeId: carlos.id,
        date: todayStr,
        timeIn: carlosIn,
        expectedTimeOut: getExpectedDutyEnd(carlosDuty),
        timeOut: carlosOut,
        targetDate: todayStr,
        targetDutyTime: carlos.expectedDutyTime || "3:00 am",
        totalHours: carlosCalc.totalHours,
        regularHours: carlosCalc.regularHours,
        overtimeHours: carlosCalc.overtimeHours,
        undertimeHours: carlosCalc.undertimeHours,
        status: carlosCalc.status,
        notes: "Standard 8h shift",
      },
      {
        employeeId: ana.id,
        date: todayStr,
        timeIn: anaIn,
        expectedTimeOut: getExpectedDutyEnd(anaDuty),
        timeOut: null,
        targetDate: todayStr,
        targetDutyTime: ana.expectedDutyTime || "3:00 am",
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        undertimeHours: 0,
        status: "LOGGED_IN",
        notes: "Shift in progress",
      },
    ];

    for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
      const pastDate = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      if (pastDate.getDay() === 0 || pastDate.getDay() === 6) continue;

      const pastStr = toIsoDate(pastDate);

      for (const emp of insertedEmps) {
        const startHour = 7 + (emp.id % 2);
        const pastIn = new Date(`${pastStr}T0${startHour}:00:00`);

        let durationHours = 8;
        if (emp.employeeCode === "GS-1001" && dayOffset % 3 === 0) durationHours = 10;
        else if (emp.employeeCode === "GS-1002" && dayOffset % 4 === 0) durationHours = 6;
        else if (emp.employeeCode === "GS-1005" && dayOffset % 5 === 0) durationHours = 9.5;

        const pastOut = new Date(pastIn.getTime() + durationHours * 60 * 60 * 1000);
        const pastDuty = getExpectedDutyStart(pastStr, emp.expectedDutyTime || "12:00 am");
        const pastCalc = calculateDutyShiftSummary(pastIn, pastOut, pastDuty);

        attendanceList.push({
          employeeId: emp.id,
          date: pastStr,
          timeIn: pastIn,
          expectedTimeOut: getExpectedDutyEnd(pastDuty),
          timeOut: pastOut,
          targetDate: pastStr,
          targetDutyTime: emp.expectedDutyTime || emp.dutyTime || "12:00 am",
          totalHours: pastCalc.totalHours,
          regularHours: pastCalc.regularHours,
          overtimeHours: pastCalc.overtimeHours,
          undertimeHours: pastCalc.undertimeHours,
          status: pastCalc.status,
          notes: pastCalc.overtimeHours > 0 ? "Extended shift OT" : "Standard shift",
        });
      }
    }

    await db.insert(attendance).values(attendanceList);

    return NextResponse.json({
      success: true,
      message: `Seeded ${insertedEmps.length} employees and ${attendanceList.length} attendance records!`,
      employeesCount: insertedEmps.length,
      attendanceCount: attendanceList.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
