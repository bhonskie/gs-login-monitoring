import { NextResponse } from "next/server";
import { db } from "@/db";
import { warnings, employees, auditTrail } from "@/db/schema";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";

function buildTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true" || port === 465;
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

function warningHtml(w: {
  warningNo: string;
  employeeName: string;
  employeeCode: string;
  empLevel: string;
  position: string;
  supervisor: string | null;
  absentDates: string;
  consecutiveCount: number;
  warningLevel: string;
  reason: string;
  emailSent: boolean;
  emailError: string | null;
  issuedBy: string;
  createdAt: Date;
}): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><style>
body{font-family:"Segoe UI",Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc;}
.wrap{max-width:640px;margin:20px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;}
.top{background:#0f172a;color:#e2e8f0;padding:20px 28px;text-align:center;}
.top h1{font-size:18px;font-weight:900;color:#fff;margin:4px 0 0;}
.top .no{font-family:monospace;font-size:14px;color:#f87171;margin-top:4px;}
.top .org{font-size:9px;letter-spacing:2px;color:#94a3b8;}
.body{padding:24px 28px;}
.grid{display:flex;flex-wrap:wrap;}
.cell{width:50%;padding:4px 0;font-size:13px;}
.cell.full{width:100%;}
.label{color:#64748b;}
.val{font-weight:700;}
.reason-box{background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:12px 16px;font-size:13px;margin:16px 0;}
.reason-box strong{color:#be123c;}
.sigs{display:flex;gap:32px;margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;}
.sig{flex:1;text-align:center;}
.sig .line{height:32px;border-bottom:1px solid #94a3b8;margin-bottom:6px;}
.sig .cap{font-size:10px;color:#64748b;}
.footer{text-align:center;font-size:10px;color:#94a3b8;padding:16px 28px;border-top:1px solid #e2e8f0;}
</style></head><body>
<div class="wrap">
<div class="top">
  <p class="org">GS LOG IN / LOG OUT MONITORING — MEDIA TRACK INFORMATION LOGISTICS SYSTEM</p>
  <h1>ATTENDANCE WARNING NOTICE</h1>
  <p class="no">${w.warningNo}</p>
</div>
<div class="body">
<div class="grid">
  <div class="cell"><span class="label">Employee Name:</span> <span class="val">${w.employeeName}</span></div>
  <div class="cell"><span class="label">Employee ID:</span> <span class="val">${w.employeeCode}</span></div>
  <div class="cell"><span class="label">Department / Level:</span> <span class="val">${w.empLevel}</span></div>
  <div class="cell"><span class="label">Position:</span> <span class="val">${w.position}</span></div>
  <div class="cell"><span class="label">Supervisor:</span> <span class="val">${w.supervisor || "—"}</span></div>
  <div class="cell"><span class="label">Date Generated:</span> <span class="val">${new Date(w.createdAt).toLocaleDateString()}</span></div>
  <div class="cell full"><span class="label">Consecutive Absent Dates:</span> <span class="val">${w.absentDates}</span></div>
  <div class="cell"><span class="label">Consecutive Absences:</span> <span class="val">${w.consecutiveCount}</span></div>
  <div class="cell"><span class="label">Warning Level:</span> <span class="val" style="color:#c2410c;">${w.warningLevel}</span></div>
  <div class="cell"><span class="label">Issued By:</span> <span class="val">${w.issuedBy}</span></div>
</div>
<div class="reason-box">
  <strong>Reason: </strong>&ldquo;${w.reason}&rdquo;
</div>
<p style="font-size:13px;color:#334155;margin-bottom:8px;">
  As required by company policy, a <strong>${w.warningLevel}</strong> has been issued.
  Please contact your supervisor or Human Resources immediately to explain your absence and provide any required documentation.
</p>
<p style="font-size:13px;color:#334155;">
  Failure to report or continued unauthorized absences may result in additional disciplinary action, including temporary account suspension.
</p>
<div class="sigs">
  <div class="sig"><div class="line"></div><p class="cap">Employee Acknowledgement<br/>(Signature / Date)</p></div>
  <div class="sig"><div class="line"></div><p class="cap">HR / Administrator<br/>(Signature / Date)</p></div>
</div>
</div>
<div class="footer">
  This notice is stored permanently in the employee&rsquo;s Warning History.<br/>
  GS Log In/Log Out Monitoring System — Media Track Information Logistics System.
</div>
</div>
</body></html>`;
}

/**
 * POST /api/warnings/:id/email
 *
 * Sends the Attendance Warning Notice as an HTML email to the employee's
 * registered email address. Records the action in the audit trail and
 * updates the warning's emailSent / emailError fields.
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

    // Get the employee's registered email
    const [emp] = await db.select().from(employees).where(eq(employees.id, w.employeeId));
    if (!emp) {
      return NextResponse.json({ success: false, message: "Employee record not found" }, { status: 404 });
    }
    if (!emp.email) {
      // Update warning's error field
      await db
        .update(warnings)
        .set({ emailSent: false, emailError: "No registered email address" })
        .where(eq(warnings.id, w.id));
      return NextResponse.json(
        {
          success: false,
          message: `Cannot send — ${emp.name} does not have a registered email address. Update their profile first.`,
        },
        { status: 400 }
      );
    }

    const transporter = buildTransporter();
    if (!transporter) {
      await db
        .update(warnings)
        .set({ emailSent: false, emailError: "SMTP not configured on the server" })
        .where(eq(warnings.id, w.id));

      await db.insert(auditTrail).values({
        actor: adminName,
        action: "EMAIL_WARNING_ATTEMPTED",
        employeeCode: w.employeeCode,
        details: `Warning ${w.warningNo} email attempted to ${emp.email} by ${adminName} — SMTP not configured.`,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "Gmail email is not configured yet. Set SMTP_USER (your Gmail address) and SMTP_PASS (Gmail App Password) in the .env file. To create an App Password: Google Account → Security → 2-Step Verification → App Passwords.",
        },
        { status: 503 }
      );
    }

    // Send the email
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: emp.email,
        subject: `Attendance Warning Notice – ${w.warningNo} — ${w.consecutiveCount} Consecutive Absences`,
        html: warningHtml(w),
      });

      await db
        .update(warnings)
        .set({ emailSent: true, emailError: null })
        .where(eq(warnings.id, w.id));

      await db.insert(auditTrail).values({
        actor: adminName,
        action: "EMAIL_WARNING_SENT",
        employeeCode: w.employeeCode,
        details: `Warning ${w.warningNo} emailed to ${emp.email} by ${adminName}. Subject: Attendance Warning Notice – ${w.consecutiveCount} Consecutive Absences.`,
      });

      return NextResponse.json({
        success: true,
        message: `Warning notice ${w.warningNo} emailed successfully to ${emp.email}.`,
        data: { warningNo: w.warningNo, sentTo: emp.email },
      });
    } catch (smtpErr: unknown) {
      const errMsg = smtpErr instanceof Error ? smtpErr.message : "SMTP send failed";

      await db
        .update(warnings)
        .set({ emailSent: false, emailError: errMsg })
        .where(eq(warnings.id, w.id));

      await db.insert(auditTrail).values({
        actor: adminName,
        action: "EMAIL_WARNING_FAILED",
        employeeCode: w.employeeCode,
        details: `Warning ${w.warningNo} email to ${emp.email} failed: ${errMsg}.`,
      });

      return NextResponse.json(
        { success: false, message: `Email send failed: ${errMsg}` },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
