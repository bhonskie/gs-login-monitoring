"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Navbar, AppTab } from "@/components/Navbar";
import { ClockTerminal } from "@/components/ClockTerminal";
import { EmployeePersonalView } from "@/components/EmployeePersonalView";
import { AttendanceReports } from "@/components/AttendanceReports";
import { EmployeeManager } from "@/components/EmployeeManager";
import { ViolationsDashboard } from "@/components/ViolationsDashboard";
import { AdminLoginModal } from "@/components/AdminLoginModal";
import { RegisterEmployeeModal } from "@/components/RegisterEmployeeModal";
import { RefreshCw } from "lucide-react";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<AppTab>("terminal");

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch employees list (no auto-seeding; directory starts empty until staff register)
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employees");
      const data = await res.json();

      if (res.ok && data.success) {
        setEmployees(data.data);
      }
    } catch {
      // transient fetch error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData, refreshKey]);

  const handleRefreshAll = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    // Return to the employee-facing terminal on admin logout
    setActiveTab("terminal");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white pb-16">
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminLoggedIn={isAdminLoggedIn}
        onOpenAdminLogin={() => setIsAdminModalOpen(true)}
        onAdminLogout={handleAdminLogout}
        onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
      />

      {/* Main Page Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Loading Skeleton */}
        {loading && employees.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm font-mono text-slate-400">
              Initializing GS Log In/Log Out Monitoring System...
            </p>
          </div>
        ) : (
          <>
            {activeTab === "terminal" && (
              <ClockTerminal
                employees={employees}
                onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
                onRefreshData={handleRefreshAll}
              />
            )}

            {activeTab === "personal" && (
              <EmployeePersonalView
                employees={employees.map(({ pin, ...rest }: any) => rest)}
              />
            )}

            {activeTab === "reports" && isAdminLoggedIn && (
              <AttendanceReports
                isAdminLoggedIn={isAdminLoggedIn}
                onRefreshData={handleRefreshAll}
              />
            )}

            {activeTab === "employees" && isAdminLoggedIn && (
              <EmployeeManager
                employees={employees}
                isAdminLoggedIn={isAdminLoggedIn}
                onOpenRegisterModal={() => setIsRegisterModalOpen(true)}
                onRefreshData={handleRefreshAll}
                onOpenAdminLogin={() => setIsAdminModalOpen(true)}
              />
            )}

            {activeTab === "violations" && isAdminLoggedIn && (
              <ViolationsDashboard />
            )}
          </>
        )}
      </main>

      {/* Modals */}
      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSuccess={() => {
          setIsAdminLoggedIn(true);
          setActiveTab("reports"); // Land admin on the reports dashboard after login
        }}
      />

      <RegisterEmployeeModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onEmployeeAdded={handleRefreshAll}
      />
    </div>
  );
}
