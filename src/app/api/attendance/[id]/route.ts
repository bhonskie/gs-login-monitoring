import { NextResponse } from "next/server";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  calculateDutyShiftSummary,
  getExpectedDutyEnd,
  getExpectedDutyStart,
  computeLateMinutes,
  toAppIsoDate,
} from "@/lib/attendance";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const attId = parseInt(params.id, 10);
    if (isNaN(attId)) {
      return NextResponse.json({ success: false, message: "Invalid attendance ID" }, { status: 400 });
    }

    const [deleted] = await db.delete(attendance).where(eq(attendance.id, attId)).returning();

    if (!deleted) {
      return NextResponse.json({ success: false, message: "Attendance record not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Attendance entry deleted successfully",
      data: deleted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const attId = parseInt(params.id, 10);
    if (isNaN(attId)) {
      return NextResponse.json({ success: false, message: "Invalid attendance ID" }, { status: 400 });
    }

    const body = await req.json();
    const { timeIn, timeOut, notes, location, targetDate, targetDutyTime } = body;

    const existing = await db.select().from(attendance).where(eq(attendance.id, attId));
    if (!existing.length) {
      return NextResponse.json({ success: false, message: "Attendance record not found" }, { status: 404 });
    }

    const currentRecord = existing[0];
    const newTimeIn = timeIn
      ? new Date(timeIn)
      : currentRecord.timeIn
        ? new Date(currentRecord.timeIn)
        : null;
    const newTimeOut = timeOut !== undefined ? (timeOut ? new Date(timeOut) : null) : currentRecord.timeOut;
    const dateStr = toAppIsoDate(newTimeIn || newTimeOut || new Date());

    const finalTargetDate = targetDate !== undefined ? targetDate : currentRecord.targetDate;
    const finalTargetDutyTime =
      targetDutyTime !== undefined ? targetDutyTime : currentRecord.targetDutyTime || "12:00 am";
    const dutyStartUtc = getExpectedDutyStart(finalTargetDate, finalTargetDutyTime);
    const expectedOut = getExpectedDutyEnd(dutyStartUtc);

    // Missing Log In record (logout exists but login missing) → Incomplete Attendance
    const summary =
      newTimeIn === null && newTimeOut !== null
        ? {
            totalHours: 0,
            regularHours: 0,
            overtimeHours: 0,
            undertimeHours: 0,
            status: "INCOMPLETE" as const,
            displayText: "Incomplete Attendance — Missing Log In",
          }
        : calculateDutyShiftSummary(newTimeIn as Date, newTimeOut, dutyStartUtc);
    const lateMinutes = newTimeIn ? computeLateMinutes(newTimeIn, finalTargetDate, finalTargetDutyTime) : 0;

    const [updated] = await db
      .update(attendance)
      .set({
        date: dateStr,
        timeIn: newTimeIn,
        expectedTimeOut: expectedOut,
        timeOut: newTimeOut,
        targetDate: finalTargetDate,
        targetDutyTime: finalTargetDutyTime,
        lateMinutes,
        totalHours: summary.totalHours,
        regularHours: summary.regularHours,
        overtimeHours: summary.overtimeHours,
        undertimeHours: summary.undertimeHours,
        status: summary.status,
        ...(notes !== undefined && { notes: notes }),
        ...(location !== undefined && { location: location }),
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, attId))
      .returning();

    return NextResponse.json({
      success: true,
      message: "Attendance entry updated successfully",
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
