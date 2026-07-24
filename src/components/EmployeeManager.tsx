"use client";

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Search,
  Briefcase,
  Key,
  Mail,
  ShieldCheck,
  Clock,
  Layers,
  CalendarOff,
  Pencil,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
  Save,
  FileText,
} from "lucide-react";
import { EMPLOYEE_REMARKS } from "@/lib/attendance";
import { RemarksCalendar } from "@/components/RemarksCalendar";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
  level: string;
  position: string;
  pin: string;
  email?: string | null;
  dutyTime?: string | null;
  expectedDutyTime?: string | null;
  dayOff?: string | null;
  remark?: string | null;
  avatarColor?: string | null;
  status: string;
  accountStatus?: string | null;
}

interface EmployeeManagerProps {
  employees: Employee[];
  isAdminLoggedIn: boolean;
  onOpenRegisterModal: () => void;
  onRefreshData: () => void;
  onOpenAdminLogin: () => void;
}

export function EmployeeManager({
  employees,
  isAdminLoggedIn,
  onOpenRegisterModal,
  onRefreshData,
  onOpenAdminLogin,
}: EmployeeManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("ALL");
  const [selectedRemark, setSelectedRemark] = useState("ALL");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Edit employee modal state
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editLevel, setEditLevel] = useState("Level A");
  const [editPosition, setEditPosition] = useState("Plotter");
  const [editExpectedDutyTime, setEditExpectedDutyTime] = useState("12:00 am");
  const [editDayOffs, setEditDayOffs] = useState<string[]>([]);
  const [editPin, setEditPin] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRemark, setEditRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.position.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLevel = selectedLevel === "ALL" || emp.level === selectedLevel;
    const matchesRemark =
      selectedRemark === "ALL" ||
      (selectedRemark === "NONE" ? !emp.remark : emp.remark === selectedRemark);

    return matchesSearch && matchesLevel && matchesRemark;
  });

  const handleOpenEdit = (emp: Employee) => {
    setEditEmp(emp);
    setEditName(emp.name);
    setEditLevel(emp.level);
    setEditPosition(emp.position);
    setEditExpectedDutyTime(emp.expectedDutyTime || "12:00 am");
    setEditDayOffs(
      emp.dayOff
        ? emp.dayOff
            .split(",")
            .map((d) => d.trim())
            .filter((d) => DAYS_OF_WEEK.includes(d))
        : []
    );
    setEditPin(emp.pin);
    setEditEmail(emp.email || "");
    setEditRemark(emp.remark || "");
    setEditError(null);
    setEditSuccess(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmp) return;

    if (editPin.trim().length < 4) {
      setEditError("PIN code must be at least 4 digits.");
      return;
    }

    setSaving(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const res = await fetch(`/api/employees/${editEmp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          level: editLevel,
          position: editPosition,
          expectedDutyTime: editExpectedDutyTime,
          dayOff: editDayOffs,
          pin: editPin,
          email: editEmail,
          remark: editRemark,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEditSuccess("Employee information updated successfully!");
        onRefreshData();
        setTimeout(() => {
          setEditEmp(null);
          setEditSuccess(null);
        }, 1200);
      } else {
        setEditError(data.message || "Failed to update employee.");
      }
    } catch {
      setEditError("Server connection error while saving changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!isAdminLoggedIn) {
      alert("Administrator login is required to delete employees.");
      onOpenAdminLogin();
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete ${emp.name} (${emp.employeeCode})?\nThis action will also remove all associated attendance logs!`
      )
    ) {
      return;
    }

    setDeletingId(emp.id);

    try {
      const res = await fetch(`/api/employees/${emp.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onRefreshData();
      } else {
        alert(data.message || "Failed to delete employee.");
      }
    } catch {
      alert("Error contacting server to delete employee.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Employee Directory & Master Roster
            </h2>
            <p className="text-xs text-slate-400">
              Manage workforce personnel, levels, duty times & security PIN access
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenRegisterModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              Add New Employee
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, employee code, or job position..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="ALL">All Levels</option>
              <option value="Level A">Level A</option>
              <option value="Level B">Level B</option>
              <option value="Level C">Level C</option>
              <option value="Level D">Level D</option>
            </select>
          </div>

          {/* Filter Option List for Employee Remarks */}
          <div className="sm:col-span-3">
            <select
              value={selectedRemark}
              onChange={(e) => setSelectedRemark(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="ALL">All Remarks</option>
              <option value="NONE">No Remark (Regular Duty)</option>
              {EMPLOYEE_REMARKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Everyday Remarks Calendar — mark which day remarks are recorded for each employee */}
      <RemarksCalendar employees={employees} />

      {!isAdminLoggedIn && (
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Anyone can register new employee information. Editing or deleting employees requires Administrator Mode.
            </span>
          </div>
          <button
            onClick={onOpenAdminLogin}
            className="px-2.5 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg shrink-0 transition"
          >
            Admin Sign In
          </button>
        </div>
      )}

      {filteredEmployees.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-3">
          <Users className="w-12 h-12 stroke-1 mx-auto text-slate-600" />
          <p className="text-sm">No employees found matching filter criteria.</p>
          <button
            onClick={onOpenRegisterModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
          >
            <UserPlus className="w-4 h-4" />
            Add First Employee
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition flex flex-col justify-between space-y-4 group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl ${
                        emp.avatarColor || "bg-indigo-600"
                      } flex items-center justify-center text-white font-bold text-base shadow-md ring-2 ring-white/10`}
                    >
                      {emp.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base leading-tight">
                        {emp.name}
                      </h3>
                      <span className="inline-block mt-1 font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 text-indigo-400 border border-slate-800">
                        {emp.employeeCode}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                      emp.accountStatus === "LOCKED"
                        ? "bg-rose-950 text-rose-400 border-rose-800"
                        : "bg-emerald-950 text-emerald-400 border-emerald-800"
                    }`}
                  >
                    {emp.accountStatus === "LOCKED" ? "LOCKED" : emp.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Level: <strong className="text-white">{emp.level}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Position: <strong className="text-white">{emp.position}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Expected Duty: <strong className="text-purple-300 font-mono">{emp.expectedDutyTime || "12:00 am"}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <CalendarOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Day Off: <strong className="text-rose-300">{emp.dayOff || "None"}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Remarks: <strong className="text-purple-300">{emp.remark || "None"}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 font-mono">
                    <Key className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>
                      Security PIN:{" "}
                      <span className="text-white font-bold tracking-widest">
                        {isAdminLoggedIn ? emp.pin : "••••"}
                      </span>
                    </span>
                  </div>

                  {emp.email && (
                    <div className="flex items-center gap-2 text-slate-400 text-[11px] truncate">
                      <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                <span className="text-[10px] font-mono text-slate-500">
                  ID #{emp.id}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(emp)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-700/60 transition active:scale-95"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleDeleteEmployee(emp)}
                    disabled={deletingId === emp.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 transition active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingId === emp.id ? "Deleting..." : "Delete"}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Employee Modal */}
      {editEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditEmp(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">
                <Pencil className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Edit Employee Information</h3>
                <p className="text-xs text-slate-400">
                  {editEmp.employeeCode} — correct any wrong information
                </p>
              </div>
            </div>

            {editError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span className="font-semibold">{editSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Level <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
                    value={editExpectedDutyTime}
                    onChange={(e) => setEditExpectedDutyTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-mono"
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
                    type="text"
                    required
                    maxLength={8}
                    minLength={4}
                    value={editPin}
                    onChange={(e) => setEditPin(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-mono tracking-widest"
                  />
                </div>
              </div>

              {/* Day Off Checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <CalendarOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>
                    Day Off Selection{" "}
                    <span className="text-slate-500 font-normal">(check day offs, optional)</span>
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const active = editDayOffs.includes(day);
                    return (
                      <label
                        key={day}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-semibold border cursor-pointer transition select-none ${
                          active
                            ? "bg-rose-950/60 text-rose-100 border-rose-600/70"
                            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700/70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() =>
                            setEditDayOffs((prev) =>
                              active ? prev.filter((d) => d !== day) : [...prev, day]
                            )
                          }
                          className="h-3.5 w-3.5 rounded accent-rose-500 cursor-pointer"
                        />
                        <span className="flex-1">{day.slice(0, 3)}</span>
                      </label>
                    );
                  })}
                </div>
                {editDayOffs.length > 0 && (
                  <p className="text-[11px] text-rose-300 mt-1.5 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Selected: {editDayOffs.join(", ")}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="employee@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span>Remark (leave options, optional)</span>
                </label>
                <select
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">-- No Remark (Regular Duty) --</option>
                  {EMPLOYEE_REMARKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditEmp(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
