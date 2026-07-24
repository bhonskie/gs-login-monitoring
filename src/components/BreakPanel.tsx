"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Coffee, UtensilsCrossed, Play, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { formatTime } from "@/lib/attendance";

interface BreakRecord {
  id: number;
  employeeId: number;
  breakType: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  status: string;
  violation: string | null;
}

interface BreakPolicy {
  mealsCount: number;
  mealMinutes: number;
  coffeeCount: number;
  coffeeMinutes: number;
  graceMinutes: number;
}

interface BreakPanelProps {
  employeeCode: string;
  pin: string;
  hasActiveShift: boolean;
  activeBreakEmployeeIds?: boolean; // parent-provided hint
  onBreakStateChange?: (onBreak: boolean) => void;
  onRefresh?: () => void;
  refreshKey?: number;
}

export function BreakPanel({
  employeeCode,
  pin,
  hasActiveShift,
  onBreakStateChange,
  onRefresh,
  refreshKey = 0,
}: BreakPanelProps) {
  const [records, setRecords] = useState<BreakRecord[]>([]);
  const [policy, setPolicy] = useState<BreakPolicy | null>(null);
  const [todayTotal, setTodayTotal] = useState(0);
  const [activeBreak, setActiveBreak] = useState<BreakRecord | null>(null);
  const [breakType, setBreakType] = useState<"Meal Break" | "Coffee Break">("Coffee Break");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchBreaks = useCallback(async () => {
    if (!employeeCode) {
      setRecords([]);
      setActiveBreak(null);
      onBreakStateChange?.(false);
      return;
    }
    try {
      const res = await fetch(`/api/breaks?employeeCode=${encodeURIComponent(employeeCode)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords(data.data);
        setPolicy(data.policy);
        const active = data.data.find((r: BreakRecord) => r.status === "ON_BREAK") || null;
        setActiveBreak(active);
        onBreakStateChange?.(!!active);
        setTodayTotal(
          data.data.reduce((acc: number, r: BreakRecord) => acc + (r.durationMinutes || 0), 0)
        );
      }
    } catch {
      // transient fetch issue
    }
  }, [employeeCode, onBreakStateChange]);

  useEffect(() => {
    fetchBreaks();
    const t = setInterval(fetchBreaks, 20000);
    return () => clearInterval(t);
  }, [fetchBreaks, refreshKey]);

  // Always visible: show guidance until the employee select + PIN are ready
  if (!employeeCode) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-amber-800/60 bg-amber-950/20 p-4">
        <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
          <Coffee className="w-4 h-4 text-amber-400" />
          Break Management
        </h3>
        <p className="text-[11px] text-amber-200/80 mt-1.5 leading-relaxed">
          {!employeeCode
            ? "⬆ The Break buttons appear here — first choose yourself in the Select Employee dropdown above."
            : "Enter your Security PIN above, then tap Start Break after you Log In."}
        </p>
      </div>
    );
  }

  const handleBreakAction = async (action: "start" | "end") => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch("/api/breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode,
          pin,
          action,
          breakType: action === "start" ? breakType : (activeBreak?.breakType || breakType),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotice(data.message);
        fetchBreaks();
        onRefresh?.();
      } else {
        setError(data.message || "Break action failed.");
      }
    } catch {
      setError("Server connection error.");
    } finally {
      setLoading(false);
    }
  };

  // Countdown against allowance (break minutes + grace)
  let elapsedMin = 0;
  let remainingMin = 0;
  let allowedMin = 0;
  let exceededBy = 0;
  if (activeBreak && policy) {
    allowedMin =
      (activeBreak.breakType === "Meal Break" ? policy.mealMinutes : policy.coffeeMinutes) +
      policy.graceMinutes;
    elapsedMin = Math.max(0, (nowTick - new Date(activeBreak.startTime).getTime()) / 60000);
    remainingMin = Math.max(0, allowedMin - elapsedMin);
    exceededBy = Math.max(0, elapsedMin - allowedMin);
  }

  const usedMeals = records.filter((r) => r.breakType === "Meal Break").length;
  const usedCoffee = records.filter((r) => r.breakType === "Coffee Break").length;

  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wide">
          <Coffee className="w-4 h-4 text-amber-400" />
          Break Management
        </h3>
        {policy && (
          <span className="text-[10px] text-slate-500 font-mono">
            Meal {usedMeals}/{policy.mealsCount}×{policy.mealMinutes}m • Coffee {usedCoffee}/
            {policy.coffeeCount}×{policy.coffeeMinutes}m (+{policy.graceMinutes}m grace) • Today:{" "}
            {todayTotal.toFixed(1)} min
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-950/70 border border-rose-800/70 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-3 p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-800/70 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Active break live countdown (employee notifications) */}
      {activeBreak && policy && (
        <div
          className={`mb-3 p-3 rounded-xl border text-center ${
            exceededBy > 0
              ? "bg-rose-950/70 border-rose-700/70"
              : remainingMin <= 5
                ? "bg-amber-950/70 border-amber-700/70"
                : "bg-purple-950/60 border-purple-700/60"
          }`}
        >
          <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400">
            {activeBreak.breakType} in progress — started {formatTime(activeBreak.startTime)}
          </div>
          <div
            className={`text-2xl font-mono font-black mt-1 ${
              exceededBy > 0 ? "text-rose-300" : remainingMin <= 5 ? "text-amber-300" : "text-purple-200"
            }`}
          >
            {exceededBy > 0
              ? `+${exceededBy.toFixed(1)} min OVER`
              : `${remainingMin.toFixed(1)} min left`}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {exceededBy > 0
              ? "Break time exceeded — Admin has been notified."
              : remainingMin <= 5
                ? "5 minutes (or less) remain before your break ends — wrap up now."
                : `Elapsed ${elapsedMin.toFixed(1)} min of ${allowedMin} min allowance`}
          </div>
        </div>
      )}

      {/* Controls — buttons disabled based on current status per module rules */}
      <div className="grid grid-cols-[auto_1fr_1fr] items-stretch gap-2">
        <select
          value={breakType}
          onChange={(e) => setBreakType(e.target.value as "Meal Break" | "Coffee Break")}
          disabled={!hasActiveShift || !!activeBreak}
          className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-40"
          title="Break type"
        >
          <option value="Coffee Break">☕ Coffee</option>
          <option value="Meal Break">🍽 Meal</option>
        </select>

        <button
          onClick={() => handleBreakAction("start")}
          disabled={loading || !hasActiveShift || !!activeBreak || !pin}
          title={
            !hasActiveShift
              ? "Log in first to start a break"
              : activeBreak
                ? "End your current break first"
                : "Start Break"
          }
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-3.5 h-3.5" />
          Start Break
        </button>

        <button
          onClick={() => handleBreakAction("end")}
          disabled={loading || !activeBreak}
          title={!activeBreak ? "No active break to end" : "Done Break"}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Done Break
        </button>
      </div>
      {!pin && (
        <p className="text-[10px] text-slate-500 mt-1.5">
          Enter your Security PIN above to enable Start Break.
        </p>
      )}

      {/* Today's break history (own records) */}
      {records.length > 0 && (
        <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {records.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 bg-slate-900/70 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-[11px]"
            >
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                {r.breakType === "Meal Break" ? (
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Coffee className="w-3.5 h-3.5 text-purple-400" />
                )}
                {r.breakType}
                {r.violation && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 font-bold" title={r.violation}>
                    VIOLATION
                  </span>
                )}
              </span>
              <span className="font-mono text-slate-400">
                {formatTime(r.startTime)} – {r.endTime ? formatTime(r.endTime) : "…"}
              </span>
              <span className="font-mono font-bold text-amber-300">
                {r.status === "ON_BREAK" ? (
                  <span className="text-purple-300">On Break</span>
                ) : (
                  `${r.durationMinutes.toFixed(1)}m (${(r.durationMinutes / 60).toFixed(2)}h)`
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeBreak && (
        <p className="text-[10px] text-amber-400/90 mt-2 flex items-center gap-1">
          <Clock3 className="w-3 h-3" />
          Log Out is disabled until you tap Done Break.
        </p>
      )}
    </div>
  );
}
