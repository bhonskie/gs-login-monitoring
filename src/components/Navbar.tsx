"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  ShieldCheck,
  Lock,
  User,
  Calendar,
  Users,
  LogOut,
  ShieldAlert,
  ChevronDown,
  Mail,
} from "lucide-react";

export type AppTab = "terminal" | "personal" | "reports" | "employees" | "violations";

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isAdminLoggedIn: boolean;
  onOpenAdminLogin: () => void;
  onAdminLogout: () => void;
  onOpenRegisterModal: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  isAdminLoggedIn,
  onOpenAdminLogin,
  onAdminLogout,
  onOpenRegisterModal,
}: NavbarProps) {
  const [time, setTime] = useState<Date | null>(null);
  const [showLeaders, setShowLeaders] = useState(false);

  const TEAM_LEADERS = [
    { name: "Bonnie Lofranco Patio", email: "bonnie.patio@mediatrack.org" },
    { name: "Thomas Jayson Lorenzo", email: "thomas.lorenzo@mediatrack.org" },
    { name: "Marivel Noquillo", email: "marivel.noquillo@mediatrack.org" },
  ];

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & System Title — Media Track, Information Logistics System */}
          <div className="flex items-center space-x-3">
            <div className="flex items-start gap-1.5 select-none" aria-label="Media Track logo">
              <span className="mt-1 block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div className="leading-none">
                <div className="flex items-baseline gap-1">
                  <span className="text-[20px] font-black italic tracking-tight text-teal-400">Media</span>
                </div>
                <span className="block text-[20px] font-black tracking-tight text-white -mt-0.5">Track</span>
                <span className="block text-[8px] font-bold tracking-[0.16em] text-orange-500 mt-1 whitespace-nowrap">
                  INFORMATION LOGISTICS SYSTEM
                </span>
              </div>
            </div>
            <div className="hidden md:block border-l border-slate-700 pl-3 relative">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                GS Log In/Log Out
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Monitoring
                </span>
              </h1>
              <button
                onClick={() => setShowLeaders((s) => !s)}
                className="text-xs text-slate-400 hover:text-teal-300 hidden sm:flex items-center gap-1 transition mt-0.5"
                aria-expanded={showLeaders}
              >
                GS Team Leaders
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${showLeaders ? "rotate-180 text-teal-400" : ""}`}
                />
              </button>

              {/* GS Team Leaders expandable list (underneath the header label) */}
              {showLeaders && (
                <div className="absolute left-0 top-full mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-40">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-teal-400 mb-2">
                    GS Team Leaders
                  </p>
                  <div className="space-y-2">
                    {TEAM_LEADERS.map((leader) => (
                      <div key={leader.email} className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-600/20 border border-teal-700/50 flex items-center justify-center text-teal-300 text-[10px] font-bold shrink-0">
                          {leader.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white leading-tight">
                            {leader.name}
                          </div>
                          <a
                            href={`mailto:${leader.email}`}
                            className="text-[11px] text-slate-400 hover:text-teal-300 flex items-center gap-1 break-all"
                          >
                            <Mail className="w-3 h-3 shrink-0" />
                            {leader.email}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Digital Clock */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-800/80 px-3.5 py-1.5 rounded-lg border border-slate-700/60 font-mono text-sm text-blue-300 shadow-inner">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>
              {time
                ? time.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }) +
                  " | " +
                  time.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })
                : "--:--:--"}
            </span>
          </div>

          {/* Action & Admin Controls */}
          <div className="flex items-center gap-2">
            {/* Quick Add Employee button */}
            <button
              onClick={onOpenRegisterModal}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm active:scale-95"
            >
              <User className="w-3.5 h-3.5" />
              Add Employee
            </button>

            {/* Admin Login status / button */}
            {isAdminLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="hidden md:inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-800/60">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin Active
                </span>
                <button
                  onClick={onAdminLogout}
                  title="Sign out of Admin mode"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded-lg transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Exit Admin
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAdminLogin}
                title="Admin Portal Login"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-lg transition"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">Admin Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex space-x-1 sm:space-x-2 border-t border-slate-800 py-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === "terminal"
                ? "bg-blue-600 text-white shadow-md font-semibold"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Clock className="w-4 h-4" />
            Clock In / Out Terminal
          </button>

          <button
            onClick={() => setActiveTab("personal")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === "personal"
                ? "bg-blue-600 text-white shadow-md font-semibold"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <User className="w-4 h-4 text-emerald-400" />
            Employee Check Attendance
          </button>

          {/* Admin-only tabs: hidden from employees until Admin Portal Login */}
          {isAdminLoggedIn && (
            <>
              <button
                onClick={() => setActiveTab("reports")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeTab === "reports"
                    ? "bg-amber-600 text-slate-950 shadow-md font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Calendar className="w-4 h-4" />
                Attendance Reports & Spreadsheet
                <ShieldCheck className="w-3.5 h-3.5 opacity-80" />
              </button>

              <button
                onClick={() => setActiveTab("employees")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeTab === "employees"
                    ? "bg-amber-600 text-slate-950 shadow-md font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Users className="w-4 h-4" />
                Employee Directory
                <ShieldCheck className="w-3.5 h-3.5 opacity-80" />
              </button>

              <button
                onClick={() => setActiveTab("violations")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  activeTab === "violations"
                    ? "bg-rose-600 text-white shadow-md font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Attendance Violations
                <ShieldCheck className="w-3.5 h-3.5 opacity-80" />
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
