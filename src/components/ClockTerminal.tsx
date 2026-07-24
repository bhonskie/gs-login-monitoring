"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  LogIn,
  LogOut,
  Key,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Info,
  Calendar,
  Coffee,
} from "lucide-react";
import { formatTime, toIsoDate, formatlate, deriveAttendanceStatusVisual } from "@/lib/attendance";
import { BreakPanel } from "@/components/BreakPanel";

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
  level: string;
  position: string;
  pin: string;
  avatarColor: string;
  dutyTime?: string | null;
  expectedDutyTime?: string | null;
}

interface ClockTerminalProps {
  employees: Employee[];
  onOpenRegisterModal: () => void;
  onRefreshData: () => void;
}

export function ClockTerminal({
  employees,
  onOpenRegisterModal,
  onRefreshData,
}: ClockTerminalProps) {
  const [selectedCode, setSelectedCode] = useState("");
  const [pin, setPin] = useState("");
  const [targetDate, setTargetDate] = useState(toIsoDate(new Date()));
  const [targetDutyTime, setTargetDutyTime] = useState("12:00 am");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
    calculationNotice?: string;
  } | null>(null);

  const [activeShiftEmployees, setActiveShiftEmployees] = useState<any[]>([]);
  const [onBreakEmployeeIds, setOnBreakEmployeeIds] = useState<number[]>([]);
  const [currentEmployeeOnBreak, setCurrentEmployeeOnBreak] = useState(false);
  const [breakRefreshKey, setBreakRefreshKey] = useState(0);

  const fetchActiveLogs = async () => {
    try {
      const [attRes, breakRes] = await Promise.all([
        fetch("/api/attendance?viewMode=today"),
        fetch("/api/breaks"),
      ]);
      const data = await attRes.json();
      if (attRes.ok && data.success) {
        const active = data.data.filter((r: any) => !r.timeOut);
        setActiveShiftEmployees(active);
      }
      const bData = await breakRes.json();
      if (breakRes.ok && bData.success) {
        setOnBreakEmployeeIds(bData.onBreakEmployeeIds || []);
      }
    } catch {
      // transient error handling
    }
  };

  useEffect(() => {
    fetchActiveLogs();
    const t = setInterval(fetchActiveLogs, 20000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    fetchActiveLogs();
  }, [breakRefreshKey]);

  const selectedEmp = employees.find(
    (e) => e.employeeCode.toUpperCase() === selectedCode.trim().toUpperCase()
  );

  // Synchronize target duty time with selected employee
  useEffect(() => {
    if (selectedEmp) {
      setTargetDutyTime(selectedEmp.expectedDutyTime || selectedEmp.dutyTime || "12:00 am");
    }
  }, [selectedCode]);

  const handleClockAction = async (action: "clock-in" | "clock-out") => {
    setAlertInfo(null);

    if (!selectedCode) {
      setAlertInfo({
        type: "error",
        title: "Missing Employee Code",
        message: "Please select or type your Employee Code.",
      });
      return;
    }

    if (!pin) {
      setAlertInfo({
        type: "error",
        title: "PIN Required",
        message: "Please enter your security PIN code.",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode: selectedCode.trim(),
          pin: pin.trim(),
          action,
          notes,
          targetDate,
          ExpectedDutyTime: targetDutyTime,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setAlertInfo({
          type: "success",
          title: action === "clock-in" ? "Shift Log In Successful" : "Shift Log Out Successful",
          message: data.message,
          calculationNotice: data.data?.calculationNotice,
        });

        setPin("");
        setNotes("");
        fetchActiveLogs();
        setBreakRefreshKey((k) => k + 1);
        onRefreshData();
      } else {
        setAlertInfo({
          type: "error",
          title: "Clock Request Failed",
          message: data.message || "Invalid credentials or clock attempt.",
        });
      }
    } catch {
      setAlertInfo({
        type: "error",
        title: "Connection Error",
        message: "Failed to communicate with attendance server.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Result Display */}
      {alertInfo && (
        <div
          className={`p-4 rounded-2xl border transition-all shadow-lg ${
            alertInfo.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-100"
              : "bg-rose-950/80 border-rose-500/50 text-rose-100"
          }`}
        >
          <div className="flex items-start gap-3">
            {alertInfo.type === "success" ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="font-bold text-sm sm:text-base">{alertInfo.title}</h4>
              <p className="text-xs sm:text-sm mt-1 leading-relaxed text-slate-200">
                {alertInfo.message}
              </p>
              {alertInfo.calculationNotice && (
                <div className="mt-3 p-2.5 rounded-lg bg-black/30 border border-white/10 font-mono text-xs sm:text-sm text-emerald-300 font-medium">
                  📊 Shift Breakdown: {alertInfo.calculationNotice}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Clock-in/Out Terminal Form */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Clock className="w-64 h-64 text-blue-500" />
          </div>

          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Employee Clock-In / Clock-Out
                </h2>
                <p className="text-xs text-slate-400">
                  Standard 8-hour shift calculates automatically upon log in
                </p>
              </div>
            </div>

            <button
              onClick={onOpenRegisterModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Info</span>
            </button>
          </div>

          {/* Clock Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex justify-between items-center">
                <span>Select Employee</span>
                {selectedEmp && (
                  <span className="text-xs text-emerald-400 font-normal">
                    {selectedEmp.name} ({selectedEmp.level} • {selectedEmp.position})
                  </span>
                )}
              </label>

              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">
                  {employees.length === 0
                    ? "-- No employees registered yet (use Add Info) --"
                    : "-- Choose Employee --"}
                </option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.employeeCode}>
                    {emp.employeeCode} - {emp.name} ({emp.level} | {emp.position})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Logging Target Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {/* Expected Duty Time Option List: 12:00 am, 2:00 am, and 3:00 am */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Expected Duty Time
                </label>
                <select
                  value={targetDutyTime}
                  onChange={(e) => setTargetDutyTime(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
                >
                  <option value="12:00 am">12:00 am</option>
                  <option value="2:00 am">2:00 am</option>
                  <option value="3:00 am">3:00 am</option>
                </select>
              </div>
            </div>

            {/* Fixed Duty Schedule Timeframes legend */}
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Duty 12:00 am</div>
                <div className="text-xs font-mono font-bold text-amber-300">ends 8:00 am</div>
              </div>
              <div className="text-center border-x border-slate-800">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Duty 2:00 am</div>
                <div className="text-xs font-mono font-bold text-amber-300">ends 10:00 am</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Duty 3:00 am</div>
                <div className="text-xs font-mono font-bold text-amber-300">ends 11:00 am</div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Security PIN Code
              </label>
              <div className="relative">
                <input
                  type="password"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN (e.g. 1234)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <Key className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Demo default PINs: 1234 (Juan), 2345 (Maria), 3456 (Carlos)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Shift Note / Task Details (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Standard production shift"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3">
              <button
                onClick={() => handleClockAction("clock-in")}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm sm:text-base shadow-lg transition transform active:scale-95 disabled:opacity-50"
              >
                <LogIn className="w-5 h-5" />
                <span>Log In (Clock In)</span>
              </button>

              <button
                onClick={() => handleClockAction("clock-out")}
                disabled={loading || currentEmployeeOnBreak}
                title={currentEmployeeOnBreak ? "End your active break first" : "Log Out"}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-sm sm:text-base shadow-lg transition transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <LogOut className="w-5 h-5" />
                <span>Log Out (Clock Out)</span>
              </button>
            </div>

            {/* Break Management Module — always visible below Log In / Log Out buttons */}
            <BreakPanel
              employeeCode={selectedEmp?.employeeCode || ""}
              pin={pin}
              hasActiveShift={
                !!selectedEmp && activeShiftEmployees.some((r) => r.employeeId === selectedEmp.id)
              }
              onBreakStateChange={(onBreak) => setCurrentEmployeeOnBreak(onBreak)}
              onRefresh={() => setBreakRefreshKey((k) => k + 1)}
              refreshKey={breakRefreshKey}
            />
          </div>

          <div className="mt-6 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
              <Info className="w-4 h-4 shrink-0" />
              <span>Shift Calculation Rules:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>
                <strong>Clock In:</strong> Expected 8-hour shift countdown begins.
              </li>
              <li>
                <strong>Overtime (&gt; 8.0 hrs):</strong> Juan logs in 7:00 AM → expected out 3:00 PM → worked until 5:00 PM = <span className="text-amber-300 font-semibold">"Completed 8.0 hrs" plus 2.0 hrs OT</span>.
              </li>
              <li>
                <strong>Undertime (&lt; 8.0 hrs):</strong> Juan logs in 7:00 AM → expected out 3:00 PM → logged out 11:00 AM = <span className="text-rose-300 font-semibold">4.0 hrs undertime</span>.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Side: Active Duty Status */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <h3 className="font-bold text-white text-base">On-Duty Employees</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                {activeShiftEmployees.length} Active
              </span>
            </div>

            {activeShiftEmployees.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-center text-slate-500 space-y-2">
                <Clock className="w-10 h-10 stroke-1 text-slate-600" />
                <p className="text-xs">No employees currently logged in.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {activeShiftEmployees.map((record) => (
                  <div
                    key={record.id}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl ${
                          record.avatarColor || "bg-blue-600"
                        } flex items-center justify-center text-white font-bold text-sm shadow-md`}
                      >
                        {record.employeeName
                          ? record.employeeName
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .slice(0, 2)
                          : "EP"}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                          {record.employeeName}
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                            {record.employeeCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {record.level} • {record.position} (Duty: {record.targetDutyTime || "12:00 am"})
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Target: {record.targetDate}
                        </div>
                        {onBreakEmployeeIds.includes(record.employeeId) && (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/70 text-[10px] font-bold">
                            <Coffee className="w-3 h-3" /> On Break
                          </span>
                        )}
                        {deriveAttendanceStatusVisual(record).remark === "Missing Log Out" ? (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[10px] font-bold">
                            ⚠ Incomplete Attendance — Missing Log Out
                          </span>
                        ) : (record.lateMinutes || 0) > 0 ? (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[10px] font-bold">
                            ⚠ LATE — {formatlate(record.lateMinutes)}
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 text-[10px] font-bold">
                            ✓ On Time
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono text-emerald-400 font-semibold">
                        In: {formatTime(record.timeIn)}
                      </div>
                      <div className="text-[11px] font-mono text-amber-400">
                        Exp Out: {formatTime(record.expectedTimeOut)}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-bold mt-0.5 ${
                          (record.lateMinutes || 0) > 0 ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {(record.lateMinutes || 0) > 0
                          ? `Late: ${((record.lateMinutes || 0) / 60).toFixed(1)} hrs`
                          : "Late: 0.0 hrs"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pt-4 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-400 block mb-2">
                Quick Tap to Select Staff:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {employees.slice(0, 6).map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedCode(emp.employeeCode)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-mono transition"
                  >
                    {emp.employeeCode} ({emp.name.split(" ")[0]})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
