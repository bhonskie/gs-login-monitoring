import { NextResponse } from "next/server";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { EMPLOYEE_REMARKS } from "@/lib/attendance";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const empId = parseInt(params.id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ success: false, message: "Invalid employee ID" }, { status: 400 });
    }

    const [deleted] = await db.delete(employees).where(eq(employees.id, empId)).returning();

    if (!deleted) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Employee ${deleted.name} (${deleted.employeeCode}) deleted successfully`,
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
    const empId = parseInt(params.id, 10);
    if (isNaN(empId)) {
      return NextResponse.json({ success: false, message: "Invalid employee ID" }, { status: 400 });
    }

    const body = await req.json();
    const { name, level, position, pin, email, dutyTime, expectedDutyTime, dayOff, remark, status } = body;

    const validDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const finalDayOff =
      dayOff === undefined
        ? undefined
        : Array.isArray(dayOff)
          ? dayOff.filter((d) => typeof d === "string" && validDays.includes(d)).join(", ") || null
          : null;

    // Remark must be one of the predefined employee remark options (empty string clears it)
    if (
      remark !== undefined &&
      remark !== null &&
      remark !== "" &&
      (typeof remark !== "string" || !EMPLOYEE_REMARKS.includes(remark))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid remark. Allowed options: ${EMPLOYEE_REMARKS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const finalRemark =
      remark === undefined
        ? undefined
        : remark === "" || remark === null
          ? null
          : remark;

    const [updated] = await db
      .update(employees)
      .set({
        ...(name && { name: name.trim() }),
        ...(level && { level: level.trim() }),
        ...(position && { position: position.trim() }),
        ...(pin && { pin: pin.trim() }),
        ...(email !== undefined && { email: email ? email.trim() : null }),
        ...(dutyTime !== undefined && { dutyTime: dutyTime ? dutyTime.trim() : null }),
        ...(expectedDutyTime !== undefined && {
          expectedDutyTime: expectedDutyTime ? expectedDutyTime.trim() : null,
        }),
        ...(finalDayOff !== undefined && { dayOff: finalDayOff }),
        ...(finalRemark !== undefined && { remark: finalRemark }),
        ...(status && { status }),
      })
      .where(eq(employees.id, empId))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Employee details updated successfully",
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
