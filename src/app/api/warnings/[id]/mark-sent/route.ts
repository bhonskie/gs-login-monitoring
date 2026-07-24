import { NextResponse } from "next/server";
import { db } from "@/db";
import { warnings, auditTrail } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/warnings/:id/mark-sent
 * Marks the warning's emailSent = true after admin opens Gmail compose.
 * Records the action in the audit trail.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const warnId = parseInt(params.id, 10);
    if (isNaN(warnId)) {
      return NextResponse.json({ success: false, message: "Invalid warning ID" }, { status: 400 });
    }

    const rows = await db.select().from(warnings).where(eq(warnings.id, warnId));
    if (!rows.length) {
      return NextResponse.json({ success: false, message: "Warning notice not found" }, { status: 404 });
    }

    const w = rows[0];
    const body = await req.json().catch(() => ({}));
    const adminName = (body as Record<string, string>).adminName || "System Admin";

    // Mark as sent
    await db
      .update(warnings)
      .set({ emailSent: true, emailError: null })
      .where(eq(warnings.id, warnId));

    // Audit trail
    await db.insert(auditTrail).values({
      actor: adminName,
      action: "EMAIL_WARNING_SENT_VIA_GMAIL",
      employeeCode: w.employeeCode,
      details: `Warning ${w.warningNo} — email sent via Gmail compose by ${adminName}. Status updated to Yes.`,
    });

    return NextResponse.json({
      success: true,
      message: `Email sent status for ${w.warningNo} updated to Yes.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
