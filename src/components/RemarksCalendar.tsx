"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { EMPLOYEE_REMARKS } from "@/lib/attendance";
import { formatDate } from "@/lib/attendance";

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
}

interface RemarkRecord {
  id: number;
  employeeId: number;
  date: string;
  remark: string;
  employeeName: string;
  employeeCode: string;
}

const REMARK_COLORS: Record<string, string> = {
  "Vacation Leave": "bg-sky-900/70 text-sky-300 border-sky-700/60",
  "Sick Leave": "bg-rose-900/70 text-rose-300 border-rose-700/60",
  "Emergency Leave": "bg-orange-900/70 text-orange-300 border-orange-700/60",
  "Maternity Leave": "bg-pink-900/70 text-pink-300 border-pink-700/60",
  "Paternity Leave": "bg-indigo-900/70 text-indigo-300 border-indigo-700/60",
  "Disconnected / ISP Issue": "bg-red-900/70 text-red-300 border-red-700/60",
  "Power Interruption": "bg-amber-900/70 text-amber-300 border-amber-700/60",
  "Internet Maintenance": "bg-teal-900/70 text-teal-300 border-teal-700/60",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface RemarksCalendarProps {
  employees: Employee[];
}

export function RemarksCalendar({ employees }: RemarksCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [records, setRecords] = useState<RemarkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formEmployeeId, setFormEmployeeId] = useState<string>("");
  const [formRemark, setFormRemark] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const fetchMonthRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employee-remarks?month=${monthKey}`);
      const data = await res.json();
      if (res.ok && data.success) setRecords(data.data);
    } catch {
      // transient fetch issue
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    fetchMonthRecords();
  }, [fetchMonthRecords]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const recordsForDay = (day: number | null) => {
    if (!day) return [];
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    return records.filter((r) => r.date === key);
  };

  const selectedDayRecords = selectedDay ? records.filter((r) => r.date === selectedDay) : [];

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay || !formEmployeeId || !formRemark) return;
    setSaving(true);
    try {
      const res = await fetch("/api/employee-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: parseInt(formEmployeeId, 10),
          date: selectedDay,
          remark: formRemark,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFormEmployeeId("");
        setFormRemark("");
        fetchMonthRecords();
      } else {
        alert(data.message || "Failed to save remark.");
      }
    } catch {
      alert("Server connection error.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRemark = async (recordId: number) => {
    try {
      const res = await fetch(`/api/employee-remarks?id=${recordId}`, { method: "DELETE" });
      if (res.ok) fetchMonthRecords();
    } catch {
      // transient
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-3 text-left group flex-1 min-w-0"
          aria-expanded={!collapsed}
        >
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Employee Remarks Calendar
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    collapsed
                      ? "bg-purple-950/70 text-purple-300 border-purple-700/60"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {collapsed ? "Show" : "Hide"}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Everyday record of remarks — mark which day a remark applies to each employee
              </p>
            </div>
          </div>
          <span className="ml-auto p-1.5 rounded-lg bg-slate-800 group-hover:bg-slate-700 text-slate-300 border border-slate-700 transition shrink-0">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </span>
        </button>
      </div>

      {/* Legend + month nav + calendar grid (collapsible) */}
      {!collapsed && (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-slate-800">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {EMPLOYEE_REMARKS.map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
              <span
                className={`w-2.5 h-2.5 rounded-full border ${REMARK_COLORS[r] || "bg-slate-700 text-slate-300"}`}
              ></span>
              {r}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => goMonth(-1)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white min-w-[130px] text-center">
            {new Date(year, month, 1).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <button
            onClick={() => goMonth(1)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setYear(now.getFullYear());
              setMonth(now.getMonth());
              setSelectedDay(todayKey);
            }}
            className="ml-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="py-10 text-center text-slate-400 font-mono text-xs animate-pulse">
          Loading remarks calendar...
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((day, idx) => {
              const dayMarks = recordsForDay(day);
              const dayKey = day
                ? `${monthKey}-${String(day).padStart(2, "0")}`
                : "";
              const isToday = dayKey === todayKey;
              return (
                <button
                  key={idx}
                  disabled={!day}
                  onClick={() => day && setSelectedDay(dayKey)}
                  className={`min-h-[64px] sm:min-h-[80px] rounded-lg p-1.5 text-left border transition align-top ${
                    !day
                      ? "bg-transparent border-transparent cursor-default"
                      : selectedDay === dayKey
                        ? "bg-purple-950/60 border-purple-500/70 hover:border-purple-400"
                        : isToday
                          ? "bg-slate-800/80 border-emerald-600/60 hover:border-emerald-400"
                          : dayMarks.length > 0
                            ? "bg-slate-800/60 border-slate-700 hover:border-purple-500/50"
                            : "bg-slate-950/60 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  {day && (
                    <div className="flex flex-col gap-1 h-full">
                      <span
                        className={`text-[11px] font-bold ${
                          isToday ? "text-emerald-400" : "text-slate-300"
                        }`}
                      >
                        {day}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        {dayMarks.slice(0, 2).map((m) => (
                          <span
                            key={m.id}
                            className={`text-[8px] sm:text-[9px] px-1 py-0.5 rounded border font-semibold truncate ${
                              REMARK_COLORS[m.remark] || "bg-slate-700 text-slate-200"
                            }`}
                            title={`${m.employeeName} — ${m.remark}`}
                          >
                            {m.employeeName.split(" ")[0]} · {m.remark.split(" ")[0]}
                          </span>
                        ))}
                        {dayMarks.length > 2 && (
                          <span className="text-[9px] text-slate-400 pl-0.5">
                            +{dayMarks.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
        </>
      )}

      {/* Day detail modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100 max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedDay(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <CalendarDays className="w-4 h-4 text-purple-400" />
              {formatDate(selectedDay)}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Remarks marked on this day ({selectedDayRecords.length} record
              {selectedDayRecords.length === 1 ? "" : "s"})
            </p>

            {/* Existing marks */}
            <div className="space-y-2 mb-5">
              {selectedDayRecords.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  No remarks marked for this day yet.
                </p>
              ) : (
                selectedDayRecords.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded border font-semibold shrink-0 ${
                          REMARK_COLORS[m.remark] || "bg-slate-700 text-slate-200"
                        }`}
                      >
                        {m.remark}
                      </span>
                      <span className="text-xs text-white font-semibold truncate">
                        {m.employeeName}
                        <span className="text-slate-500 font-mono text-[10px] ml-1.5">
                          {m.employeeCode}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveRemark(m.id)}
                      title="Unmark this remark"
                      className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-rose-400 transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add new mark */}
            <form onSubmit={handleAddRemark} className="space-y-3 pt-4 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Employee</label>
                <select
                  value={formEmployeeId}
                  onChange={(e) => setFormEmployeeId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employeeCode} - {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Remark</label>
                <select
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="">-- Select Remark --</option>
                  {EMPLOYEE_REMARKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving || !formEmployeeId || !formRemark}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition disabled:opacity-50 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                {saving ? "Marking..." : `Mark Remark on ${formatDate(selectedDay)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
