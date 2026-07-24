import { NextResponse } from "next/server";
import { db } from "@/db";
import { employeeRemarks, employees } from "@/db/schema";
import { eq, gte, lte, desc, and } from "drizzle-orm";
import { EMPLOYEE_REMARKS } from "@/lib/attendance";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // YYYY-MM

    const conditions = [];
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      conditions.push(gte(employeeRemarks.date, `${monthParam}-01`));
      conditions.push(lte(employeeRemarks.date, `${monthParam}-31`));
    }

    const rows = await db
      .select({
        id: employeeRemarks.id,
        employeeId: employeeRemarks.employeeId,
        date: employeeRemarks.date,
        remark: employeeRemarks.remark,
        createdAt: employeeRemarks.createdAt,
        employeeName: employees.name,
        employeeCode: employees.employeeCode,
        level: employees.level,
        position: employees.position,
        avatarColor: employees.avatarColor,
      })
      .from(employeeRemarks)
      .innerJoin(employees, eq(employeeRemarks.employeeId, employees.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(employeeRemarks.date), desc(employeeRemarks.id));

    return NextResponse.json({ success: true, count: rows.length, data: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeId, date, remark } = body;

    if (!employeeId || isNaN(parseInt(employeeId, 10))) {
      return NextResponse.json({ success: false, message: "Employee is required" }, { status: 400 });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, message: "A valid date (YYYY-MM-DD) is required" },
        { status: 400 }
      );
    }
    if (!remark || !EMPLOYEE_REMARKS.includes(remark)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid remark. Allowed options: ${EMPLOYEE_REMARKS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const empId = parseInt(employeeId, 10);
    const [emp] = await db.select().from(employees).where(eq(employees.id, empId));
    if (!emp) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    // One remark per employee per day: update if already marked, otherwise insert
    const existing = await db
      .select()
      .from(employeeRemarks)
      .where(and(eq(employeeRemarks.employeeId, empId), eq(employeeRemarks.date, date)));

    let record;
    let action: "CREATED" | "UPDATED" = "CREATED";
    if (existing.length > 0) {
      [record] = await db
        .update(employeeRemarks)
        .set({ remark })
        .where(eq(employeeRemarks.id, existing[0].id))
        .returning();
      action = "UPDATED";
    } else {
      [record] = await db
        .insert(employeeRemarks)
        .values({ employeeId: empId, date, remark })
        .returning();
    }

    return NextResponse.json({
      success: true,
      action,
      message: `Remark "${remark}" marked on ${date} for ${emp.name}`,
      data: record,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    const dateParam = searchParams.get("date");
    const employeeIdParam = searchParams.get("employeeId");

    // Delete by record id, or clear a whole employee-day mark
    if (idParam && !isNaN(parseInt(idParam, 10))) {
      const [deleted] = await db
        .delete(employeeRemarks)
        .where(eq(employeeRemarks.id, parseInt(idParam, 10)))
        .returning();
      if (!deleted) {
        return NextResponse.json({ success: false, message: "Remark record not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: "Remark unmarked for that day", data: deleted });
    }

    if (dateParam && employeeIdParam && !isNaN(parseInt(employeeIdParam, 10))) {
      const deleted = await db
        .delete(employeeRemarks)
        .where(
          and(
            eq(employeeRemarks.employeeId, parseInt(employeeIdParam, 10)),
            eq(employeeRemarks.date, dateParam)
          )
        )
        .returning();
      return NextResponse.json({
        success: true,
        message: `Cleared ${deleted.length} remark mark(s)`,
        count: deleted.length,
      });
    }

    return NextResponse.json(
      { success: false, message: "Provide record id (or employeeId + date) to delete" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
