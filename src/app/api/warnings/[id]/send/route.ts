import { NextResponse } from "next/server";
import { db } from "@/db";
import { warnings, auditTrail } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/warnings/:id/send
 * "Send to Plotter" — renders the warning notice as a print-ready HTML document
 * that the browser sends straight to the system printer/plotter queue.
 *
 * Returns a full self-contained HTML page with @media print styles so the
 * client can open it in a new tab and trigger window.print() automatically.
 * The audit trail records each send.
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

    const body = await req.json().catch(() => ({}));
    const adminName = (body as Record<string, string>).adminName || "System Admin";

    const w = rows[0];

    // Record the send action in the audit trail
    await db.insert(auditTrail).values({
      actor: adminName,
      action: "SEND_WARNING_TO_PLOTTER",
      employeeCode: w.employeeCode,
      details: `Warning ${w.warningNo} sent to plotter/printer by ${adminName}.`,
    });

    // Build a print-ready HTML document
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Warning Notice ${w.warningNo} — ${w.employeeName}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
  .header { text-align: center; border-bottom: 3px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }
  .header .org { font-size: 9px; font-weight: 700; letter-spacing: 3px; color: #64748b; }
  .header h1 { font-size: 22px; font-weight: 900; color: #1e293b; margin-top: 6px; }
  .header .no { font-family: monospace; font-size: 14px; font-weight: 700; color: #be123c; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; margin-bottom: 20px; }
  .grid .full { grid-column: 1 / -1; }
  .grid .label { color: #64748b; }
  .grid .val { font-weight: 700; }
  .reason { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-bottom: 24px; }
  .reason strong { color: #be123c; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding-top: 24px; border-top: 1px solid #cbd5e1; }
  .sig { text-align: center; }
  .sig .line { height: 40px; border-bottom: 1px solid #94a3b8; margin-bottom: 6px; }
  .sig .cap { font-size: 10px; color: #64748b; }
  .footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 32px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="no-print" style="background:#0f172a;color:#e2e8f0;padding:12px 20px;border-radius:10px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;">
  <span style="font-size:13px;font-weight:700;">Warning Notice ${w.warningNo} — Ready for Plotter</span>
  <button onclick="window.print()" style="background:#10b981;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">🖨 Print / Send to Plotter</button>
</div>

<div class="header">
  <p class="org">GS LOG IN / LOG OUT MONITORING — MEDIA TRACK INFORMATION LOGISTICS SYSTEM</p>
  <h1>ATTENDANCE WARNING NOTICE</h1>
  <p class="no">${w.warningNo}</p>
</div>

<div class="grid">
  <div><span class="label">Employee Name:</span> <span class="val">${w.employeeName}</span></div>
  <div><span class="label">Employee ID:</span> <span class="val">${w.employeeCode}</span></div>
  <div><span class="label">Department / Level:</span> <span class="val">${w.empLevel}</span></div>
  <div><span class="label">Position:</span> <span class="val">${w.position}</span></div>
  <div><span class="label">Supervisor:</span> <span class="val">${w.supervisor || "________________"}</span></div>
  <div><span class="label">Date Generated:</span> <span class="val">${new Date(w.createdAt).toLocaleDateString()}</span></div>
  <div class="full"><span class="label">Consecutive Absent Dates:</span> <span class="val">${w.absentDates}</span></div>
  <div><span class="label">Number of Consecutive Absences:</span> <span class="val">${w.consecutiveCount}</span></div>
  <div><span class="label">Warning Level:</span> <span class="val" style="color:#c2410c;">${w.warningLevel}</span></div>
  <div><span class="label">Email Sent:</span> <span class="val">${w.emailSent ? "Yes" : "No (" + (w.emailError || "not attempted") + ")"}</span></div>
  <div><span class="label">Issued By:</span> <span class="val">${w.issuedBy}</span></div>
</div>

<div class="reason">
  <strong>Reason: </strong>"${w.reason}"
</div>

<div class="sigs">
  <div class="sig"><div class="line"></div><p class="cap">Employee Acknowledgement<br/>(Signature over Printed Name / Date)</p></div>
  <div class="sig"><div class="line"></div><p class="cap">HR / Administrator<br/>(Signature over Printed Name / Date)</p></div>
</div>

<p class="footer">
  This notice is stored permanently in the employee's Warning History.<br/>
  Generated by GS Log In/Log Out Monitoring System — Media Track Information Logistics System.
</p>

<script>
// Auto-trigger the print dialog on load so the plotter receives it immediately
window.addEventListener("load", function() { setTimeout(function(){ window.print(); }, 600); });
</script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
