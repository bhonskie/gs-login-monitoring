import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees, auditTrail } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const empId = parseInt(params.id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ success: false, message: "Invalid employee ID" }, { status: 400 });
    }

    const body = await req.json();
    const { reason, adminName } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, message: "A reason for unlocking is required" },
        { status: 400 }
      );
    }

    const [emp] = await db.select().from(employees).where(eq(employees.id, empId));
    if (!emp) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    if (emp.accountStatus !== "LOCKED") {
      return NextResponse.json({
        success: false,
        message: `${emp.name} is not locked (current status: ${emp.accountStatus || "ACTIVE"})`,
      });
    }

    const actor = (adminName && adminName.trim()) || "System Admin";
    const nowDate = new Date();

    const [updated] = await db
      .update(employees)
      .set({
        accountStatus: "ACTIVE",
        unlockReason: reason.trim(),
        unlockAdmin: actor,
        unlockedAt: nowDate,
      })
      .where(eq(employees.id, empId))
      .returning();

    await db.insert(auditTrail).values({
      actor,
      action: "UNLOCK_ACCOUNT",
      employeeCode: emp.employeeCode,
      details: `Account unlocked by ${actor}. Reason: "${reason.trim()}". Previous lock reason: ${emp.lockReason || "n/a"}. Lock date: ${emp.lockedAt || "n/a"}.`,
    });

    return NextResponse.json({
      success: true,
      message: `${emp.name}'s account has been unlocked by ${actor}.`,
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
