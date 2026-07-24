import { NextResponse } from "next/server";
import { db } from "@/db";
import { breakPolicies, auditTrail } from "@/db/schema";
import { eq } from "drizzle-orm";

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

export async function GET() {
  try {
    const rows = await db.select().from(breakPolicies).limit(1);
    const policy = rows.length ? rows[0] : { id: null, ...DEFAULT_POLICY, updatedBy: null, updatedAt: null };
    return NextResponse.json({ success: true, data: policy });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// Admin: configure break policies (audited)
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const {
      mealsCount,
      mealMinutes,
      mealPaid,
      coffeeCount,
      coffeeMinutes,
      coffeePaid,
      graceMinutes,
      mealRequired,
      adminName,
    } = body;

    const rows = await db.select().from(breakPolicies).limit(1);
    const actor = adminName || "System Admin";
    let updated;

    const values = {
      mealsCount: mealsCount !== undefined ? parseInt(mealsCount, 10) : DEFAULT_POLICY.mealsCount,
      mealMinutes: mealMinutes !== undefined ? parseInt(mealMinutes, 10) : DEFAULT_POLICY.mealMinutes,
      mealPaid: mealPaid !== undefined ? !!mealPaid : DEFAULT_POLICY.mealPaid,
      coffeeCount: coffeeCount !== undefined ? parseInt(coffeeCount, 10) : DEFAULT_POLICY.coffeeCount,
      coffeeMinutes: coffeeMinutes !== undefined ? parseInt(coffeeMinutes, 10) : DEFAULT_POLICY.coffeeMinutes,
      coffeePaid: coffeePaid !== undefined ? !!coffeePaid : DEFAULT_POLICY.coffeePaid,
      graceMinutes: graceMinutes !== undefined ? parseInt(graceMinutes, 10) : DEFAULT_POLICY.graceMinutes,
      mealRequired: mealRequired !== undefined ? !!mealRequired : DEFAULT_POLICY.mealRequired,
      updatedBy: actor,
      updatedAt: new Date(),
    };

    if (rows.length === 0) {
      [updated] = await db.insert(breakPolicies).values(values).returning();
    } else {
      [updated] = await db.update(breakPolicies).set(values).where(eq(breakPolicies.id, rows[0].id)).returning();
    }

    await db.insert(auditTrail).values({
      actor,
      action: "UPDATE_BREAK_POLICY",
      employeeCode: null,
      details: `Break policy updated by ${actor}: Meal ${updated.mealsCount}x${updated.mealMinutes}min ${updated.mealPaid ? "paid" : "unpaid"}, Coffee ${updated.coffeeCount}x${updated.coffeeMinutes}min ${updated.coffeePaid ? "paid" : "unpaid"}, Grace ${updated.graceMinutes}min, Meal required: ${updated.mealRequired ? "yes" : "no"}.`,
    });

    return NextResponse.json({
      success: true,
      message: `Break policy updated by ${actor}.`,
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
