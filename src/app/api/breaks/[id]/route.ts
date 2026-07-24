import { NextResponse } from "next/server";
import { db } from "@/db";
import { breaks, auditTrail, employees } from "@/db/schema";
import { eq } from "drizzle-orm";

// Admin: edit a break record (with reason) or override/clear its violation
export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const breakId = parseInt(params.id, 10);
    if (isNaN(breakId)) {
      return NextResponse.json({ success: false, message: "Invalid break ID" }, { status: 400 });
    }

    const body = await req.json();
    const { startTime, endTime, reason, overrideViolation, overrideReason, adminName } = body;
    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, message: "An edit reason is required" }, { status: 400 });
    }

    const existing = await db.select().from(breaks).where(eq(breaks.id, breakId));
    if (!existing.length) {
      return NextResponse.json({ success: false, message: "Break record not found" }, { status: 404 });
    }
    const rec = existing[0];

    const newStart = startTime ? new Date(startTime) : new Date(rec.startTime);
    const newEnd = endTime !== undefined ? (endTime ? new Date(endTime) : null) : rec.endTime;
    let duration = rec.durationMinutes;
    let status = rec.status;
    if (newEnd) {
      duration = Math.max(0, Math.round(((newEnd.getTime() - newStart.getTime()) / 60000) * 10) / 10);
      status = "DONE";
    } else {
      duration = 0;
      status = "ON_BREAK";
    }

    const [emp] = await db.select().from(employees).where(eq(employees.id, rec.employeeId));

    const [updated] = await db
      .update(breaks)
      .set({
        startTime: newStart,
        endTime: newEnd,
        durationMinutes: duration,
        status,
        ...(overrideViolation && {
          violation: null,
          overriddenAt: new Date(),
          overrideReason: overrideReason || null,
          overrideBy: adminName || "System Admin",
        }),
        updatedAt: new Date(),
      })
      .where(eq(breaks.id, breakId))
      .returning();

    const actor = adminName || "System Admin";
    await db.insert(auditTrail).values({
      actor,
      action: overrideViolation ? "OVERRIDE_BREAK_VIOLATION" : "EDIT_BREAK_RECORD",
      employeeCode: emp?.employeeCode || String(rec.employeeId),
      details: `Break #${breakId} ${overrideViolation ? "violation overridden" : "edited"} by ${actor}. Reason: "${reason.trim()}"${overrideReason ? ` | Override note: "${overrideReason}"` : ""}. Original violation: ${rec.violation || "none"}.`,
    });

    return NextResponse.json({
      success: true,
      message: `Break record updated by ${actor} (reason recorded).`,
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// Admin: delete a break record (with reason)
export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const breakId = parseInt(params.id, 10);
    if (isNaN(breakId)) {
      return NextResponse.json({ success: false, message: "Invalid break ID" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const reason = searchParams.get("reason") || "";
    const adminName = searchParams.get("adminName") || "System Admin";

    const existing = await db.select().from(breaks).where(eq(breaks.id, breakId));
    if (!existing.length) {
      return NextResponse.json({ success: false, message: "Break record not found" }, { status: 404 });
    }

    const [emp] = await db.select().from(employees).where(eq(employees.id, existing[0].employeeId));
    const [deleted] = await db.delete(breaks).where(eq(breaks.id, breakId)).returning();

    await db.insert(auditTrail).values({
      actor: adminName,
      action: "EDIT_BREAK_RECORD",
      employeeCode: emp?.employeeCode || String(existing[0].employeeId),
      details: `Break #${breakId} (${existing[0].breakType}, ${existing[0].date}) deleted by ${adminName}. Reason: "${reason.trim()}"`,
    });

    return NextResponse.json({ success: true, message: "Break record deleted", data: deleted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
