"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  Search,
  Trash2,
  Edit,
  Clock,
  X,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  formatTime,
  formatDate,
  toIsoDate,
  formatlate,
  deriveAttendanceStatusVisual,
} from "@/lib/attendance";
import * as XLSX from "xlsx";

interface AttendanceReportsProps {
  isAdminLoggedIn: boolean;
  onRefreshData: () => void;
}

export function AttendanceReports({ isAdminLoggedIn, onRefreshData }: AttendanceReportsProps) {
  const [viewMode, setViewMode] = useState<"today" | "weekly" | "monthly" | "custom">("today");
  const [selectedDate, setSelectedDate] = useState<string>(toIsoDate(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(
    toIsoDate(new Date()).slice(0, 7)
  );
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("ALL");

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  // Edit / Delete modal state
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editTimeIn, setEditTimeIn] = useState("");
  const [editTimeOut, setEditTimeOut] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fetchReports = async () => {
    setLoading(true);
    try {
      let url = `/api/attendance?viewMode=${viewMode}`;
      if (viewMode === "today" && selectedDate) url += `&date=${selectedDate}`;
      if (viewMode === "monthly" && selectedMonth) url += `&month=${selectedMonth}`;
      if (viewMode === "custom" && startDate && endDate)
        url += `&startDate=${startDate}&endDate=${endDate}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords(data.data);
      }
    } catch {
      // transient error handling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [viewMode, selectedDate, selectedMonth, startDate, endDate, search]);

  const filteredRecords = records.filter((rec) => {
    if (levelFilter !== "ALL" && rec.level !== levelFilter) {
      return false;
    }
    return true;
  });

  const totalLogs = filteredRecords.length;
  const activeCount = filteredRecords.filter((r) => !r.timeOut).length;
  const totalRegular = filteredRecords.reduce((acc, r) => acc + (r.regularHours || 0), 0);
  const totalOT = filteredRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
  const totalUndertime = filteredRecords.reduce((acc, r) => acc + (r.undertimeHours || 0), 0);
  const totalWorked = filteredRecords.reduce((acc, r) => acc + (r.totalHours || 0), 0);

  /**
   * Download Employee Records — fetches Everyday (Today), Weekly and Monthly
   * employee log IN / OUT records, bundles them into separate sheets in a
   * single Excel (.xlsx) workbook, and automatically downloads the file.
   */
  const handleDownloadEmployeeRecords = async () => {
    setDownloading(true);
    setDownloadNotice(null);

    try {
      const fetchScope = async (mode: "today" | "weekly" | "monthly"): Promise<any[]> => {
        const res = await fetch(`/api/attendance?viewMode=${mode}`);
        const data = await res.json();
        return res.ok && data.success ? data.data : [];
      };

      const [daily, weekly, monthly] = await Promise.all([
        fetchScope("today"),
        fetchScope("weekly"),
        fetchScope("monthly"),
      ]);

      const mapRows = (rows: any[]) =>
        rows.map((r) => {
          const derived = deriveAttendanceStatusVisual(r);
          const shiftSummary = derived.remark
            ? `Incomplete Attendance (${derived.remark})`
            : derived.key === "HALF_DAY"
              ? `Half Day (Worked ${(r.totalHours || 0).toFixed(1)} hrs)`
              : derived.key === "LOGGED_IN"
                ? "Shift In Progress (Logged In)"
                : derived.key === "OVERTIME"
                  ? `Completed ${(r.regularHours ?? 8).toFixed(1)} hrs (duty window) plus ${(r.overtimeHours || 0).toFixed(1)} hrs. OT`
                  : derived.key === "UNDERTIME"
                    ? `${(r.undertimeHours || 0).toFixed(1)} hrs. undertime (Worked ${(r.totalHours || 0).toFixed(1)} hrs)`
                    : "Completed 8.0 hrs standard shift";

          return {
            "Attendance ID": r.id,
            "Employee Code": r.employeeCode,
            "Employee Name": r.employeeName,
            Level: r.level,
            "Job Position": r.position,
            "Employee Remarks": r.dailyRemark || r.employeeRemark || "",
            "Account Status": r.accountStatus === "LOCKED" ? "LOCKED" : "ACTIVE",
            "Email Sent": r.emailSentStatus || "N/A",
            "Logged Date": r.date,
            "Log Target Date": r.targetDate || r.date,
            "Target Duty Time": r.targetDutyTime || "12:00 am",
            "Time In": formatTime(r.timeIn),
            "Expected Time Out (8.0h)": formatTime(r.expectedTimeOut),
            "Time Out": r.timeOut ? formatTime(r.timeOut) : "--:-- (Still Logged In)",
            "Check In Status": (r.lateMinutes || 0) > 0 ? `LATE (${formatlate(r.lateMinutes)})` : "On Time",
            "Late (min)": r.lateMinutes || 0,
            "Total Break (min)": (r.breakMinutes || 0).toFixed(1),
            "Total Break (hrs)": ((r.breakMinutes || 0) / 60).toFixed(2),
            "Regular Hours": (r.regularHours || 0).toFixed(1),
            "Overtime Hours": (r.overtimeHours || 0).toFixed(1),
            "Undertime Hours": (r.undertimeHours || 0).toFixed(1),
            "Total Hours Worked": (r.totalHours || 0).toFixed(1),
            "Shift Status & Summary": shiftSummary,
            Notes: r.notes || "",
          };
        });

      const dailyMapped = mapRows(daily);
      const weeklyMapped = mapRows(weekly);
      const monthlyMapped = mapRows(monthly);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          dailyMapped.length ? dailyMapped : [{ Info: "No Everyday (Today) log in/out records" }]
        ),
        "Everyday (Today)"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          weeklyMapped.length ? weeklyMapped : [{ Info: "No Weekly log in/out records" }]
        ),
        "Weekly"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          monthlyMapped.length ? monthlyMapped : [{ Info: "No Monthly log in/out records" }]
        ),
        "Monthly"
      );

      const fileName = `GS_Employee_Records_${toIsoDate(new Date())}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setDownloadNotice(`Employee records downloaded successfully (${fileName})`);
      setTimeout(() => setDownloadNotice(null), 5000);
    } catch (err) {
      console.error("Employee records export failed:", err);
      alert("Failed to generate the Excel file. Please check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteRecord = async (id: number) => {
    if (!confirm("Are you sure you want to delete this attendance record?")) return;
    try {
      const res = await fetch(`/api/attendance/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchReports();
        onRefreshData();
      }
    } catch {
      alert("Failed to delete record.");
    }
  };

  const handleOpenEdit = (rec: any) => {
    setEditItem(rec);
    setEditTimeIn(
      rec.timeIn ? new Date(rec.timeIn).toISOString().slice(0, 16) : ""
    );
    setEditTimeOut(
      rec.timeOut ? new Date(rec.timeOut).toISOString().slice(0, 16) : ""
    );
    setEditNotes(rec.notes || "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;

    try {
      const res = await fetch(`/api/attendance/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeIn: editTimeIn ? new Date(editTimeIn).toISOString() : null,
          timeOut: editTimeOut ? new Date(editTimeOut).toISOString() : null,
          notes: editNotes,
        }),
      });

      if (res.ok) {
        setEditItem(null);
        fetchReports();
        onRefreshData();
      }
    } catch {
      alert("Failed to update attendance.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Download Success Notice */}
      {downloadNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-semibold">{downloadNotice}</span>
        </div>
      )}

      {/* Top Controls Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" />
              Attendance Master Reports
            </h2>
            <p className="text-xs text-slate-400">
              Filter by daily, weekly, or monthly logs with levels & positions
            </p>
          </div>

          <button
            onClick={handleDownloadEmployeeRecords}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40 transition active:scale-95 disabled:opacity-60 shrink-0"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>{downloading ? "Generating Excel..." : "Download Employee Records"}</span>
          </button>
        </div>

        {/* View Switcher Tabs & Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 flex items-center gap-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode("today")}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                viewMode === "today"
                  ? "bg-amber-600 text-slate-950 font-bold shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Everyday / Today
            </button>
            <button
              onClick={() => setViewMode("weekly")}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                viewMode === "weekly"
                  ? "bg-amber-600 text-slate-950 font-bold shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                viewMode === "monthly"
                  ? "bg-amber-600 text-slate-950 font-bold shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode("custom")}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                viewMode === "custom"
                  ? "bg-amber-600 text-slate-950 font-bold shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Custom Range
            </button>
          </div>

          <div className="lg:col-span-4 flex items-center gap-2">
            {viewMode === "today" && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            )}

            {viewMode === "monthly" && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            )}

            {viewMode === "custom" && (
              <div className="flex items-center gap-2 w-full">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <span className="text-slate-500 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="ALL">All Levels</option>
              <option value="Level A">Level A</option>
              <option value="Level B">Level B</option>
              <option value="Level C">Level C</option>
              <option value="Level D">Level D</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name, code, level, or position..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-slate-400">Total Entries</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{totalLogs}</div>
          <span className="text-[11px] text-slate-500">{activeCount} Currently Active</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-slate-400">Regular Shift Hours</div>
          <div className="text-2xl font-bold font-mono text-blue-400 mt-1">
            {totalRegular.toFixed(1)}h
          </div>
          <span className="text-[11px] text-blue-500/80">Standard 8.0h limit</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-slate-400">Total OT Hours</div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            +{totalOT.toFixed(1)}h
          </div>
          <span className="text-[11px] text-amber-500/80">Exceeds 8.0 hours</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-slate-400">Total Undertime</div>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
            -{totalUndertime.toFixed(1)}h
          </div>
          <span className="text-[11px] text-rose-500/80">Logged out early</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-400">Grand Total Worked</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {totalWorked.toFixed(1)}h
          </div>
          <span className="text-[11px] text-emerald-500/80">Combined Duration</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {loading ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
            Loading attendance entries...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <Clock className="w-10 h-10 stroke-1 mx-auto text-slate-600" />
            <p className="text-xs">No attendance logs found for selected criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date & Employee</th>
                  <th className="py-3 px-4">Level & Position</th>
                  <th className="py-3 px-4">Duty Time</th>
                  <th className="py-3 px-4">Log Target Date</th>
                  <th className="py-3 px-4">Target Duty</th>
                  <th className="py-3 px-4">Time In</th>
                  <th className="py-3 px-4">Expected Out (8h)</th>
                  <th className="py-3 px-4">Actual Out</th>
                  <th className="py-3 px-4">Status Breakdown</th>
                  <th className="py-3 px-4 text-right">Break (min)</th>
                  <th className="py-3 px-4 text-right">Reg. Hrs</th>
                  <th className="py-3 px-4 text-right">OT Hrs</th>
                  <th className="py-3 px-4 text-right">Undertime</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  {isAdminLoggedIn && <th className="py-3 px-4 text-center">Admin</th>}
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Email Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredRecords.map((r) => {
                  const derived = deriveAttendanceStatusVisual(r);
                  const statusPill = (
                    <span className={derived.className}>
                      {derived.key === "LOGGED_IN" && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping mr-1"></span>
                      )}
                      {derived.text}
                    </span>
                  );

                  return (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{r.employeeName}</div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{r.employeeCode}</span> • <span>{formatDate(r.date)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-sans text-slate-300">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[11px] font-semibold">
                          {r.level}
                        </span>{" "}
                        <span className="text-slate-200 ml-1">{r.position}</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-amber-300">
                        {r.dutyTime || "12:00 am"}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-emerald-300">
                        {r.targetDate || r.date}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-purple-300">
                        {r.targetDutyTime || "12:00 am"}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-emerald-400 font-semibold">
                        {formatTime(r.timeIn)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-amber-400">
                        {formatTime(r.expectedTimeOut)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {r.timeOut ? formatTime(r.timeOut) : "--:--"}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          {statusPill}
                          {(r.lateMinutes || 0) > 0 ? (
                            <span className="px-2.5 py-1 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[11px] font-semibold w-max">
                              ⚠ LATE — {formatlate(r.lateMinutes)}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded bg-slate-800 text-emerald-300 border border-slate-700 text-[11px] font-semibold w-max">
                              ✓ On Time
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-right text-amber-300">
                        {(r.breakMinutes || 0) > 0 ? (
                          <span title={`Total break time: ${(r.breakMinutes / 60).toFixed(2)} hrs`}>
                            {r.breakMinutes.toFixed(1)}m
                          </span>
                        ) : (
                          <span className="text-slate-600">0.0m</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-right text-blue-300">
                        {(r.regularHours || 0).toFixed(1)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-right text-amber-400 font-bold">
                        {(r.overtimeHours || 0) > 0 ? `+${r.overtimeHours.toFixed(1)}` : "0.0"}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-right text-rose-400 font-bold">
                        {(r.undertimeHours || 0) > 0
                          ? `-${r.undertimeHours.toFixed(1)}`
                          : "0.0"}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-right text-emerald-300 font-bold">
                        {(r.totalHours || 0).toFixed(1)}
                      </td>

                      {isAdminLoggedIn && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(r)}
                              title="Edit Record"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(r.id)}
                              title="Delete Record"
                              className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-rose-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}

                      {/* Remarks recorded for this day (calendar mark) or active Directory remark */}
                      <td className="py-3.5 px-4">
                        {r.dailyRemark ? (
                          <span
                            className="px-2.5 py-1 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 text-[11px] font-semibold w-max inline-block"
                            title={`Remark marked on ${r.targetDate || r.date} via Remarks Calendar`}
                          >
                            {r.dailyRemark}
                          </span>
                        ) : r.employeeRemark ? (
                          <span
                            className="px-2.5 py-1 rounded bg-slate-800 text-purple-300 border border-slate-700 text-[11px] font-semibold w-max inline-block"
                            title="Active Directory remark"
                          >
                            {r.employeeRemark}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </td>

                      {/* Account Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border inline-flex items-center gap-1 w-max ${
                            r.accountStatus === "LOCKED"
                              ? "bg-rose-950/80 text-rose-300 border-rose-800/70"
                              : "bg-emerald-950/80 text-emerald-300 border-emerald-800/70"
                          }`}
                        >
                          {r.accountStatus === "LOCKED" ? "🔒 LOCKED" : "✅ ACTIVE"}
                        </span>
                      </td>

                      {/* Email Sent Status */}
                      <td className="py-3.5 px-4">
                        {r.emailSentStatus === null ? (
                          <span className="text-[11px] text-slate-500">—</span>
                        ) : r.emailSentStatus === "Yes" ? (
                          <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/70 text-[11px] font-bold inline-flex items-center gap-1 w-max">
                            ✉ Yes
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[11px] font-bold inline-flex items-center gap-1 w-max">
                            ✉ No
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              onClick={() => setEditItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">
              Admin Edit Attendance Log
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {editItem.employeeName} ({editItem.employeeCode})
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Time In
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editTimeIn}
                  onChange={(e) => setEditTimeIn(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Time Out
                </label>
                <input
                  type="datetime-local"
                  value={editTimeOut}
                  onChange={(e) => setEditTimeOut(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg"
                >
                  Save Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
