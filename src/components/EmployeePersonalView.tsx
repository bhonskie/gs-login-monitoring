"use client";

import React, { useState, useEffect } from "react";
import {
  UserCheck,
  Calendar,
  Clock,
  ShieldAlert,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { formatTime, formatDate, formatlate, deriveAttendanceStatusVisual } from "@/lib/attendance";
import * as XLSX from "xlsx";

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
  level: string;
  position: string;
  avatarColor: string;
  dutyTime?: string | null;
  expectedDutyTime?: string | null;
  accountStatus?: string | null;
}

interface AuthenticatedEmployee {
  id: number;
  employeeCode: string;
  name: string;
  level: string;
  position: string;
  avatarColor: string;
  dutyTime?: string | null;
  expectedDutyTime?: string | null;
}

interface EmployeePersonalViewProps {
  employees: Employee[];
}

export function EmployeePersonalView({ employees }: EmployeePersonalViewProps) {
  const [empCodeInput, setEmpCodeInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [authenticatedEmp, setAuthenticatedEmp] = useState<AuthenticatedEmployee | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"today" | "weekly" | "monthly">("today");
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Authenticate via server-side PIN check — no client-side PIN exposure
  const handleAuthenticate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const code = empCodeInput.trim().toUpperCase();
    const pin = pinInput.trim();

    if (!code) {
      setAuthError("Please enter your Employee Code.");
      return;
    }
    if (!pin) {
      setAuthError("Please enter your Security PIN.");
      return;
    }

    // Verify via the clock API (same PIN check the system uses everywhere)
    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode: code,
          pin,
          action: "verify-only",
        }),
      });
      const data = await res.json();

      // 401 = wrong PIN, 404 = not found, 403 = locked
      if (res.status === 401) {
        setAuthError("Incorrect Security PIN code.");
        return;
      }
      if (res.status === 404) {
        setAuthError("Employee Code not found.");
        return;
      }
      if (res.status === 403 || data.locked) {
        setAuthError(
          "Your account has been temporarily locked due to exceeding the allowable consecutive absences. Please contact your Administrator or Human Resources."
        );
        return;
      }

      // For any other non-success, fall through to employee lookup
    } catch {
      setAuthError("Server connection error. Please try again.");
      return;
    }

    // Find employee (only basic display info — no PIN exposed)
    const emp = employees.find(
      (e) => e.employeeCode.toUpperCase() === code
    );

    if (!emp) {
      setAuthError("Employee Code not found.");
      return;
    }

    setAuthenticatedEmp({
      id: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      level: emp.level,
      position: emp.position,
      avatarColor: emp.avatarColor,
      dutyTime: emp.dutyTime,
      expectedDutyTime: emp.expectedDutyTime,
    });
    fetchEmployeeAttendance(emp.id, viewMode);
  };

  const fetchEmployeeAttendance = async (
    employeeId: number,
    mode: "today" | "weekly" | "monthly"
  ) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/attendance?employeeId=${employeeId}&viewMode=${mode}`
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setAttendanceRecords(data.data);
      }
    } catch {
      // transient error handling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticatedEmp) {
      fetchEmployeeAttendance(authenticatedEmp.id, viewMode);
    }
  }, [viewMode]);

  const totalRegular = attendanceRecords.reduce((acc, r) => acc + (r.regularHours || 0), 0);
  const totalOT = attendanceRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
  const totalUndertime = attendanceRecords.reduce((acc, r) => acc + (r.undertimeHours || 0), 0);
  const totalHoursWorked = attendanceRecords.reduce((acc, r) => acc + (r.totalHours || 0), 0);
  const totalLateMinutes = attendanceRecords.reduce((acc, r) => acc + (r.lateMinutes || 0), 0);
  const totalLateHrs = totalLateMinutes / 60;
  const lateShiftCount = attendanceRecords.filter((r) => (r.lateMinutes || 0) > 0).length;

  const handleExportPersonalSpreadsheet = () => {
    if (!authenticatedEmp || attendanceRecords.length === 0) return;

    const rows = attendanceRecords.map((rec) => {
      let shiftSummary = "";
      if (rec.status === "LOGGED_IN") {
        shiftSummary = "In Progress";
      } else if (rec.status === "OVERTIME") {
        shiftSummary = `Completed 8.0 hrs plus ${rec.overtimeHours} hrs. OT`;
      } else if (rec.status === "UNDERTIME") {
        shiftSummary = `${rec.undertimeHours} hrs. undertime (Worked ${rec.totalHours} hrs)`;
      } else {
        shiftSummary = "Completed 8.0 hrs standard shift";
      }

      return {
        "Record ID": rec.id,
        Date: rec.date,
        "Employee Code": rec.employeeCode,
        "Employee Name": rec.employeeName,
        Level: rec.level,
        Position: rec.position,
        "Employee Remarks": rec.dailyRemark || rec.employeeRemark || "",
        "Duty Time": rec.dutyTime || "12:00 am",
        "Target Date": rec.targetDate || rec.date,
        "Target Duty Time": rec.targetDutyTime || "12:00 am",
        "Time In": formatTime(rec.timeIn),
        "Expected Time Out (8h)": formatTime(rec.expectedTimeOut),
        "Actual Time Out": formatTime(rec.timeOut),
        "Check In Status": (rec.lateMinutes || 0) > 0 ? `LATE (${formatlate(rec.lateMinutes)})` : "On Time",
        "Late (min)": rec.lateMinutes || 0,
        "Regular Hours": rec.regularHours || 0,
        "Overtime Hours": rec.overtimeHours || 0,
        "Undertime Hours": rec.undertimeHours || 0,
        "Total Hours Worked": rec.totalHours || 0,
        "Shift Calculation Summary": shiftSummary,
        Notes: rec.notes || "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Personal Attendance");

    const fileName = `${authenticatedEmp.name.replace(/\s+/g, "_")}_${viewMode}_Attendance.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              Employee Attendance Inquiry Portal
            </h2>
            <p className="text-xs text-slate-400">
              Check your personal everyday, weekly, and monthly attendance logs & 8h shift calculations
            </p>
          </div>

          {authenticatedEmp && (
            <button
              onClick={() => {
                setAuthenticatedEmp(null);
                setAttendanceRecords([]);
                setEmpCodeInput("");
                setPinInput("");
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition self-start md:self-auto"
            >
              Sign Out
            </button>
          )}
        </div>

        {!authenticatedEmp ? (
          employees.length === 0 ? (
            <div className="mt-6 py-10 text-center text-slate-500 space-y-2 max-w-xl">
              <ShieldAlert className="w-10 h-10 stroke-1 mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">No employees registered yet.</p>
              <p className="text-xs text-slate-500">
                Register first via the &quot;Add Info&quot; button on the Clock In / Out Terminal to use the inquiry portal.
              </p>
            </div>
          ) : (
          <form onSubmit={handleAuthenticate} className="mt-6 space-y-4 max-w-xl">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                For security, you can only view <strong className="text-white">your own</strong> attendance records.
                Enter your Employee Code and PIN to verify your identity.
              </span>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Your Employee Code
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={empCodeInput}
                  onChange={(e) => setEmpCodeInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="e.g. GS-1001"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Security PIN
                </label>
                <input
                  type="password"
                  required
                  autoComplete="off"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="Enter PIN"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              Verify & View My Attendance
            </button>
          </form>
          )
        ) : (
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-4">
              <div
                className={`w-14 h-14 rounded-2xl ${
                  authenticatedEmp.avatarColor || "bg-emerald-600"
                } flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ring-white/10`}
              >
                {authenticatedEmp.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  {authenticatedEmp.name}
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                    {authenticatedEmp.employeeCode}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {authenticatedEmp.level} • {authenticatedEmp.position} (Duty: {authenticatedEmp.dutyTime || "12:00 am"} | Expected: {authenticatedEmp.expectedDutyTime || "12:00 am"})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode("today")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === "today"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Everyday / Today
              </button>

              <button
                onClick={() => setViewMode("weekly")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === "weekly"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Weekly View
              </button>

              <button
                onClick={() => setViewMode("monthly")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === "monthly"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Monthly View
              </button>
            </div>
          </div>
        )}
      </div>

      {authenticatedEmp && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400 font-medium">Standard Hours</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-blue-400 mt-1">
                {totalRegular.toFixed(1)} hrs
              </div>
              <span className="text-[11px] text-slate-500">8.0h Standard Limit</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400 font-medium">Overtime Hours</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-1">
                +{totalOT.toFixed(1)} hrs
              </div>
              <span className="text-[11px] text-amber-500/80">Exceeds 8.0h</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400 font-medium">Undertime Hours</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-rose-400 mt-1">
                -{totalUndertime.toFixed(1)} hrs
              </div>
              <span className="text-[11px] text-rose-500/80">Less than 8.0h</span>
            </div>

            <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400 font-medium">Total Late Hr</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-red-400 mt-1">
                {totalLateHrs.toFixed(1)} hrs
              </div>
              <span className="text-[11px] text-red-400/80">
                {lateShiftCount > 0 ? `${lateShiftCount} late shift(s)` : "Always on time"}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400 font-medium">Total Worked</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
                {totalHoursWorked.toFixed(1)} hrs
              </div>
              <span className="text-[11px] text-emerald-500/80">
                {attendanceRecords.length} shift entries
              </span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                Personal Attendance History ({viewMode.toUpperCase()})
              </h3>

              <button
                onClick={handleExportPersonalSpreadsheet}
                disabled={attendanceRecords.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel / CSV</span>
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
                Loading attendance data...
              </div>
            ) : attendanceRecords.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <Clock className="w-10 h-10 stroke-1 mx-auto text-slate-600" />
                <p className="text-xs">No attendance records found for this view period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Log Target Date</th>
                      <th className="py-3 px-4">Target Duty</th>
                      <th className="py-3 px-4">Time In</th>
                      <th className="py-3 px-4">Expected Out (8h)</th>
                      <th className="py-3 px-4">Actual Out</th>
                      <th className="py-3 px-4">Status & Summary</th>
                      <th className="py-3 px-4 text-right">Reg. Hrs</th>
                      <th className="py-3 px-4 text-right">OT Hrs</th>
                      <th className="py-3 px-4 text-right">Undertime</th>
                      <th className="py-3 px-4 text-right">Total Hrs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {attendanceRecords.map((rec) => {
                      const derived = deriveAttendanceStatusVisual(rec);
                      const statusBadge = (
                        <span className={derived.className}>
                          {derived.key === "LOGGED_IN" && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping mr-1"></span>
                          )}
                          {derived.text}
                        </span>
                      );

                      return (
                        <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 font-mono text-slate-200">
                            {formatDate(rec.targetDate || rec.date)}
                          </td>
                          <td className="py-3 px-4 font-mono text-purple-300">
                            {rec.targetDutyTime || "12:00 am"}
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-400">
                            {formatTime(rec.timeIn)}
                          </td>
                          <td className="py-3 px-4 font-mono text-amber-400">
                            {formatTime(rec.expectedTimeOut)}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {rec.timeOut ? formatTime(rec.timeOut) : "--:--"}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              {statusBadge}
                              {(rec.lateMinutes || 0) > 0 ? (
                                <span className="px-2.5 py-1 rounded-md text-[11px] bg-rose-950/80 text-rose-300 border border-rose-800/60 font-semibold w-max">
                                  ⚠ LATE — {formatlate(rec.lateMinutes)}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-md text-[11px] bg-slate-800 text-emerald-300 border border-slate-700 font-semibold w-max">
                                  ✓ On Time
                                </span>
                              )}
                              {/* Remark marked on this day via the Remarks Calendar */}
                              {rec.dailyRemark ? (
                                <span
                                  className="px-2.5 py-1 rounded-md text-[11px] bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold w-max"
                                  title={`Remark marked on ${rec.targetDate || rec.date} via Remarks Calendar`}
                                >
                                  📅 {rec.dailyRemark}
                                </span>
                              ) : rec.employeeRemark ? (
                                <span className="px-2.5 py-1 rounded-md text-[11px] bg-slate-800 text-purple-300 border border-slate-700 font-semibold w-max">
                                  {rec.employeeRemark}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-blue-300">
                            {(rec.regularHours || 0).toFixed(1)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-amber-400 font-bold">
                            {(rec.overtimeHours || 0) > 0
                              ? `+${rec.overtimeHours.toFixed(1)}`
                              : "0.0"}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-rose-400 font-bold">
                            {(rec.undertimeHours || 0) > 0
                              ? `-${rec.undertimeHours.toFixed(1)}`
                              : "0.0"}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-emerald-300 font-bold">
                            {(rec.totalHours || 0).toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
