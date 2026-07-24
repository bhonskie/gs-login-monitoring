"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  FileWarning,
  X,
  Mail,
  MailWarning,
  ScrollText,
  Clock,
  RefreshCw,
  Printer,
  Send,
  Loader2,
} from "lucide-react";

interface WarningNotice {
  id: number;
  warningNo: string;
  employeeCode: string;
  employeeName: string;
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
  createdAt: string;
}

interface ViolationRow {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  level: string;
  position: string;
  email: string | null;
  consecutiveAbsentDays: number;
  totalMissedDays: number;
  warningLevel: string;
  rowColor: "green" | "yellow" | "orange" | "red";
  warning: WarningNotice | null;
  warningHistoryCount: number;
  emailSent: boolean | null;
  emailError: string | null;
  accountStatus: string;
  lockedAt: string | null;
  lockReason: string | null;
  unlockReason: string | null;
  unlockAdmin: string | null;
  unlockedAt: string | null;
  absentDates: string[];
}

interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  employeeCode: string | null;
  details: string | null;
  createdAt: string;
}

export function ViolationsDashboard() {
  const [rows, setRows] = useState<ViolationRow[]>([]);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<WarningNotice | null>(null);
  const [unlockEmp, setUnlockEmp] = useState<ViolationRow | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [unlockAdmin, setUnlockAdmin] = useState("System Admin");
  const [saving, setSaving] = useState(false);
  const [sendingPlotterId, setSendingPlotterId] = useState<number | null>(null);
  const [plotterSuccess, setPlotterSuccess] = useState<string | null>(null);
  /**
   * Build a Gmail Web Compose URL pre-filled with the warning notice content.
   * Opens directly in Gmail — no SMTP configuration required.
   */
  const buildGmailComposeUrl = (warning: WarningNotice, empEmail: string | null) => {
    const targetEmail =
      empEmail ||
      `${warning.employeeName.toLowerCase().replace(/\s+/g, ".")}@mediatrack.org`;

    const subject = encodeURIComponent(
      `Attendance Warning Notice - ${warning.warningNo} — ${warning.consecutiveCount} Consecutive Absences`
    );

    const todayStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const body = encodeURIComponent(
      `Dear ${warning.employeeName},\n\n` +
      `This is an automated Attendance Warning Notice from GS Log In/Log Out Monitoring System.\n\n` +
      `Warning Notice No: ${warning.warningNo}\n` +
      `Date Generated: ${todayStr}\n` +
      `Warning Level: ${warning.warningLevel}\n` +
      `Employee ID: ${warning.employeeCode}\n` +
      `Level: ${warning.empLevel}\n` +
      `Position: ${warning.position}\n` +
      `Consecutive Absent Dates: ${warning.absentDates}\n` +
      `Number of Consecutive Absences: ${warning.consecutiveCount}\n\n` +
      `REASON:\n"${warning.reason}"\n\n` +
      `As required by company policy, a ${warning.warningLevel} has been issued.\n` +
      `Please contact your supervisor or Human Resources immediately to explain your absence and provide any required documentation.\n\n` +
      `Failure to report or continued unauthorized absences may result in additional disciplinary action, including temporary account suspension.\n\n` +
      `Best regards,\n` +
      `Media Track — GS Log In/Log Out Monitoring System\n` +
      `Information Logistics System`
    );

    return `https://mail.google.com/mail/?view=cm&fs=1&to=${targetEmail}&su=${subject}&body=${body}`;
  };

  const handleSendMail = async (warning: WarningNotice, empEmail: string | null) => {
    const url = buildGmailComposeUrl(warning, empEmail);
    window.open(url, "_blank");

    // Mark emailSent = Yes on the server so the dashboard column updates
    try {
      await fetch(`/api/warnings/${warning.id}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName: "System Admin" }),
      });
    } catch {
      // best-effort — Gmail compose still opens even if this fails
    }

    setEmailNotice(`✅ Gmail compose opened for ${warning.employeeName} (${warning.warningNo}) — Email Sent status updated to Yes.`);
    setTimeout(() => setEmailNotice(null), 5000);
    fetchViolations(); // refresh to show Email Sent: Yes
  };

  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  /**
   * Send Warning Notice to Plotter — opens the print-ready document
   * in a new tab which auto-triggers the browser's print/plotter dialog.
   */
  const handleSendToPlotter = async (warningId: number, warningNo: string) => {
    setSendingPlotterId(warningId);
    setPlotterSuccess(null);
    try {
      const res = await fetch(`/api/warnings/${warningId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName: "System Admin" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Send failed" }));
        setPlotterSuccess(`⚠ ${data.message || "Failed to send to plotter."}`);
        setTimeout(() => setPlotterSuccess(null), 6000);
        return;
      }
      const html = await res.text();
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setPlotterSuccess(`Warning ${warningNo} sent to plotter successfully.`);
        setTimeout(() => setPlotterSuccess(null), 5000);
        fetchViolations();
      } else {
        setPlotterSuccess(
          "⚠ Pop-up blocked by browser. Please allow pop-ups for this site and try again."
        );
        setTimeout(() => setPlotterSuccess(null), 8000);
      }
    } catch {
      setPlotterSuccess(
        "⚠ Could not reach the server. Please check your connection and try again."
      );
      setTimeout(() => setPlotterSuccess(null), 6000);
    } finally {
      setSendingPlotterId(null);
    }
  };

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/violations");
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(data.data);
        setAudits(data.audits || []);
      }
    } catch {
      // transient fetch issue
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockEmp || !unlockReason.trim()) return;
    if (!confirm(`Unlock ${unlockEmp.employeeName}'s account?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${unlockEmp.employeeId}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: unlockReason, adminName: unlockAdmin }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUnlockEmp(null);
        setUnlockReason("");
        fetchViolations();
      } else {
        alert(data.message || "Unlock failed.");
      }
    } catch {
      alert("Server connection error.");
    } finally {
      setSaving(false);
    }
  };

  const statusPill = (s: string) =>
    s === "LOCKED"
      ? "px-2.5 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[11px] font-bold inline-flex items-center gap-1"
      : "px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 text-[11px] font-bold inline-flex items-center gap-1";

  const colorBorder: Record<string, string> = {
    green: "border-emerald-800/60",
    yellow: "border-amber-700/70",
    orange: "border-orange-700/70",
    red: "border-rose-700/80",
  };
  const colorDot: Record<string, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
    orange: "bg-orange-500",
    red: "bg-rose-500",
  };

  const counts = {
    green: rows.filter((r) => r.rowColor === "green").length,
    yellow: rows.filter((r) => r.rowColor === "yellow").length,
    orange: rows.filter((r) => r.rowColor === "orange").length,
    red: rows.filter((r) => r.rowColor === "red").length,
  };

  return (
    <div className="space-y-6">
      {/* Plotter send success notification */}
      {plotterSuccess && (
        <div className="p-3.5 rounded-xl bg-teal-950/90 border border-teal-500/50 text-teal-200 text-xs flex items-center gap-2 animate-fadeIn shadow-lg">
          <Send className="w-5 h-5 text-teal-400 shrink-0" />
          <span className="font-semibold">{plotterSuccess}</span>
        </div>
      )}

      {/* Email send notification */}
      {emailNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 animate-fadeIn shadow-lg ${
            emailNotice.startsWith("✅")
              ? "bg-emerald-950/90 border border-emerald-500/50 text-emerald-200"
              : "bg-amber-950/90 border border-amber-500/50 text-amber-200"
          }`}
        >
          <Mail className="w-5 h-5 shrink-0" />
          <span className="font-semibold">{emailNotice}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              Attendance Violations Dashboard
            </h2>
            <p className="text-xs text-slate-400">
              3 consecutive absences → auto Warning Notice + Email • 4 → auto Account Lockout • Admin-only unlock
            </p>
          </div>
          <button
            onClick={fetchViolations}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Re-Evaluate Now
          </button>
        </div>

        {/* Legend / counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { key: "green", label: "Normal (0–1)", c: counts.green },
            { key: "yellow", label: "2 Consecutive", c: counts.yellow },
            { key: "orange", label: "3 Consecutive (Warning)", c: counts.orange },
            { key: "red", label: "4+ Consecutive (Locked)", c: counts.red },
          ].map((s) => (
            <div key={s.key} className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${colorDot[s.key]}`}></span>
              <span className="text-[11px] text-slate-300">
                {s.label}: <strong className="text-white font-mono">{s.c}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {loading ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
            Evaluating attendance violations...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <ShieldCheck className="w-10 h-10 stroke-1 mx-auto text-emerald-600" />
            <p className="text-xs">No employees to evaluate.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Employee Name</th>
                  <th className="py-3 px-3">Level</th>
                  <th className="py-3 px-3 text-center">Consec. Absent Days</th>
                  <th className="py-3 px-3 text-center">Total Missed</th>
                  <th className="py-3 px-3">Warning Level</th>
                  <th className="py-3 px-3 text-center">Email Sent</th>
                  <th className="py-3 px-3">Warning Generated</th>
                  <th className="py-3 px-3">Account Status</th>
                  <th className="py-3 px-3">Locked Date</th>
                  <th className="py-3 px-3 text-center">Unlock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {rows.map((r) => (
                  <tr
                    key={r.employeeId}
                    className={`border-l-4 ${colorBorder[r.rowColor]} hover:bg-slate-800/40 transition`}
                  >
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        {r.employeeName}
                        {r.accountStatus === "LOCKED" && (
                          <Lock className="w-3.5 h-3.5 text-rose-400" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{r.employeeCode} • {r.position}</div>
                      {r.consecutiveAbsentDays > 0 && (
                        <div className="text-[10px] text-rose-400/80 font-mono mt-0.5 truncate max-w-[180px]" title={r.absentDates.join(", ")}>
                          {r.absentDates.join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[10px] font-semibold">
                        {r.level}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-white text-sm">
                      {r.consecutiveAbsentDays}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-300">
                      {r.totalMissedDays}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-1 rounded text-[10px] font-bold border ${
                          r.rowColor === "red"
                            ? "bg-rose-950/80 text-rose-300 border-rose-800/70"
                            : r.rowColor === "orange"
                              ? "bg-orange-950/80 text-orange-300 border-orange-800/70"
                              : r.rowColor === "yellow"
                                ? "bg-amber-950/80 text-amber-300 border-amber-800/70"
                                : "bg-emerald-950/80 text-emerald-300 border-emerald-800/70"
                        }`}
                      >
                        {r.warningLevel}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.emailSent === null ? (
                        <span className="text-slate-500">—</span>
                      ) : r.emailSent ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[10px]">
                          <Mail className="w-3.5 h-3.5" /> Yes
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-rose-400 font-bold text-[10px]"
                          title={r.emailError || "Email not sent"}
                        >
                          <MailWarning className="w-3.5 h-3.5" /> No
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {r.warning ? (
                        <button
                          onClick={() => handleSendMail(r.warning!, r.email)}
                          title="Open Gmail compose with pre-filled warning notice"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-950/70 hover:bg-blue-900/70 text-blue-300 border border-blue-800/60 text-[10px] font-bold transition active:scale-95"
                        >
                          <Mail className="w-3 h-3" />
                          📩 Send Mail
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className={statusPill(r.accountStatus)}>
                        {r.accountStatus === "LOCKED" ? (
                          <>
                            <Lock className="w-3 h-3" /> LOCKED
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3" /> ACTIVE
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[10px] text-slate-400">
                      {r.lockedAt ? new Date(r.lockedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.accountStatus === "LOCKED" ? (
                        <button
                          onClick={() => {
                            setUnlockEmp(r);
                            setUnlockReason("");
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold transition active:scale-95"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Unlock
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Trail */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <ScrollText className="w-4 h-4 text-amber-400" />
          Audit Trail (Lock & Unlock Actions)
        </h3>
        {audits.length === 0 ? (
          <p className="text-xs text-slate-500">No audit entries yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {audits.map((a) => (
              <div key={a.id} className="text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-slate-300">
                  <span className="font-bold text-amber-300">{a.action}</span>
                  {a.employeeCode && (
                    <span className="font-mono text-indigo-300">{a.employeeCode}</span>
                  )}
                  <span className="text-slate-500">by {a.actor}</span>
                  <span className="ml-auto font-mono text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                {a.details && <p className="text-slate-400 mt-1">{a.details}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Warning Notice Modal */}
      {notice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white text-slate-900 rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setNotice(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
              <p className="text-[10px] font-bold tracking-[0.3em] text-slate-500">GS LOG IN/LOG OUT MONITORING</p>
              <h3 className="text-xl font-black text-slate-900 mt-1">ATTENDANCE WARNING NOTICE</h3>
              <p className="font-mono text-sm font-bold text-rose-700 mt-1">{notice.warningNo}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <div><span className="text-slate-500">Employee Name:</span> <strong>{notice.employeeName}</strong></div>
              <div><span className="text-slate-500">Employee ID:</span> <strong>{notice.employeeCode}</strong></div>
              <div><span className="text-slate-500">Department / Level:</span> <strong>{notice.empLevel}</strong></div>
              <div><span className="text-slate-500">Position:</span> <strong>{notice.position}</strong></div>
              <div><span className="text-slate-500">Supervisor:</span> <strong>{notice.supervisor || "________________"}</strong></div>
              <div><span className="text-slate-500">Date Generated:</span> <strong>{new Date(notice.createdAt).toLocaleDateString()}</strong></div>
              <div className="col-span-2"><span className="text-slate-500">Consecutive Absent Dates:</span> <strong>{notice.absentDates}</strong></div>
              <div><span className="text-slate-500">Number of Consecutive Absences:</span> <strong>{notice.consecutiveCount}</strong></div>
              <div><span className="text-slate-500">Warning Level:</span> <strong className="text-orange-700">{notice.warningLevel}</strong></div>
              <div><span className="text-slate-500">Email Sent:</span> <strong>{notice.emailSent ? "Yes" : `No (${notice.emailError || "not attempted"})`}</strong></div>
              <div><span className="text-slate-500">Issued By:</span> <strong>{notice.issuedBy}</strong></div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm">
              <span className="font-bold text-rose-700">Reason: </span>
              <span>&quot;{notice.reason}&quot;</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-6 pt-6 border-t border-slate-300">
              <div className="text-center">
                <div className="h-10 border-b border-slate-400 mb-1"></div>
                <p className="text-[11px] text-slate-500">Employee Acknowledgement (Signature over Printed Name / Date)</p>
              </div>
              <div className="text-center">
                <div className="h-10 border-b border-slate-400 mb-1"></div>
                <p className="text-[11px] text-slate-500">HR / Administrator (Signature over Printed Name / Date)</p>
              </div>
            </div>
            {/* Action buttons: Email it, Send to Plotter, Print */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  const row = rows.find((r) => r.warning?.id === notice.id);
                  handleSendMail(notice, row?.email || null);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition active:scale-95"
              >
                <Mail className="w-4 h-4" />
                📩 Send Mail
              </button>

              <button
                onClick={() => handleSendToPlotter(notice.id, notice.warningNo)}
                disabled={sendingPlotterId === notice.id}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-md transition active:scale-95 disabled:opacity-50"
              >
                {sendingPlotterId === notice.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sendingPlotterId === notice.id ? "Sending..." : "Send to Plotter"}
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm shadow-md transition active:scale-95"
              >
                <Printer className="w-4 h-4" />
                Print Notice
              </button>
            </div>

            <p className="text-[10px] text-slate-400 text-center mt-4">
              This notice is stored permanently in the employee&apos;s Warning History.
            </p>
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      {unlockEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100">
            <button
              onClick={() => setUnlockEmp(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                <Unlock className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Unlock Account (Admin Only)</h3>
                <p className="text-xs text-slate-400">
                  {unlockEmp.employeeName} ({unlockEmp.employeeCode})
                </p>
              </div>
            </div>
            <div className="text-[11px] bg-rose-950/50 border border-rose-800/60 rounded-lg p-3 mb-4 text-rose-200 font-mono">
              Locked: {unlockEmp.lockedAt ? new Date(unlockEmp.lockedAt).toLocaleString() : "n/a"}
              <br />
              Reason: {unlockEmp.lockReason || "n/a"}
            </div>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Admin Name
                </label>
                <input
                  type="text"
                  value={unlockAdmin}
                  onChange={(e) => setUnlockAdmin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for Unlocking <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g. Employee submitted approved leave documents"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUnlockEmp(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !unlockReason.trim()}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  {saving ? "Unlocking..." : "Confirm Unlock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
