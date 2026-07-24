"use client";

import React, { useState } from "react";
import { UserPlus, X, CheckCircle2, AlertCircle, Sparkles, CalendarOff, Check } from "lucide-react";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const LEVELS = ["Level A", "Level B", "Level C", "Level D"];
const POSITIONS = ["Plotter", "ECG", "QC", "Adbust", "Page Checker"];

interface RegisterEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmployeeAdded: () => void;
}

export function RegisterEmployeeModal({
  isOpen,
  onClose,
  onEmployeeAdded,
}: RegisterEmployeeModalProps) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("Level A");
  const [position, setPosition] = useState("Plotter");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [expectedDutyTime, setExpectedDutyTime] = useState("12:00 am");
  const [dayOffs, setDayOffs] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (pin.length < 4) {
      setError("PIN code must be at least 4 digits.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          level,
          position,
          pin,
          email,
          expectedDutyTime,
          dayOff: dayOffs,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMsg(
          `Registered successfully! Assigned Code: ${data.data.employeeCode}`
        );
        setName("");
        setLevel("Level A");
        setPosition("Plotter");
        setPin("");
        setEmail("");
        setExpectedDutyTime("12:00 am");
        setDayOffs([]);
        onEmployeeAdded();

        setTimeout(() => {
          onClose();
          setSuccessMsg(null);
        }, 1800);
      } else {
        setError(data.message || "Failed to register employee.");
      }
    } catch {
      setError("Server connection error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <UserPlus className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Add Employee Information</h3>
            <p className="text-xs text-slate-400">
              Register level, job position, duty times & credentials
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Full Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="e.g. Juan Dela Cruz"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Level <span className="text-rose-400">*</span>
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="Level A">Level A</option>
                <option value="Level B">Level B</option>
                <option value="Level C">Level C</option>
                <option value="Level D">Level D</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Job Position <span className="text-rose-400">*</span>
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="Plotter">Plotter</option>
                <option value="ECG">ECG</option>
                <option value="QC">QC</option>
                <option value="Adbust">Adbust</option>
                <option value="Page Checker">Page Checker</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Expected Duty Time <span className="text-rose-400">*</span>
              </label>
              <select
                value={expectedDutyTime}
                onChange={(e) => setExpectedDutyTime(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
              >
                <option value="12:00 am">12:00 am</option>
                <option value="2:00 am">2:00 am</option>
                <option value="3:00 am">3:00 am</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Security PIN Code <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                required
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono tracking-widest"
                placeholder="e.g. 1234"
              />
            </div>
          </div>

          {/* Day Off Checkboxes (Monday–Sunday, multi-select for 2 days off) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <CalendarOff className="w-3.5 h-3.5 text-rose-400" />
              <span>
                Day Off Selection{" "}
                <span className="text-slate-500 font-normal">(check up to 2 days or more, optional)</span>
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const active = dayOffs.includes(day);
                return (
                  <label
                    key={day}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold border cursor-pointer transition select-none ${
                      active
                        ? "bg-rose-950/60 text-rose-100 border-rose-600/70 shadow-sm"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700/70 hover:border-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() =>
                        setDayOffs((prev) =>
                          active ? prev.filter((d) => d !== day) : [...prev, day]
                        )
                      }
                      className="h-4 w-4 rounded accent-rose-500 cursor-pointer shrink-0"
                    />
                    <span className="flex-1">{day}</span>
                    {active && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {dayOffs.length > 0 ? (
                <>
                  Selected rest day(s):{" "}
                  <span className="text-rose-300 font-semibold">{dayOffs.join(", ")}</span>
                </>
              ) : (
                "No day off selected (Optional)"
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Email Address (Optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="employee@example.com"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loading ? "Registering..." : "Submit Employee Info"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
