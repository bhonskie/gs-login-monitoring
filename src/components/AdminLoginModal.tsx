"use client";

import React, { useState, useEffect } from "react";
import { Lock, X, ShieldCheck, AlertCircle, CheckCircle2, UserPlus, LogIn } from "lucide-react";

type Mode = "login" | "register";

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminLoginModal({ isOpen, onClose, onSuccess }: AdminLoginModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Per-field focus flags drive the readOnly anti-autofill pattern:
  // inputs start readOnly (browsers skip autofill into readOnly fields),
  // then become editable the instant the user focuses them — guaranteeing
  // blank fields every time the portal opens.
  const [uFocus, setUFocus] = useState(false);
  const [pFocus, setPFocus] = useState(false);
  const [cFocus, setCFocus] = useState(false);

  // Wipe every field + state the moment the modal opens
  useEffect(() => {
    if (isOpen) {
      setMode("login");
      setUsername("");
      setPassword("");
      setConfirm("");
      setError(null);
      setSuccess(null);
      setUFocus(false);
      setPFocus(false);
      setCFocus(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirm("");
    setPFocus(false);
    setCFocus(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          username,
          password,
          confirm: mode === "register" ? confirm : undefined,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (mode === "register") {
          setSuccess(data.message || "Admin account created. You can now sign in.");
          setUsername(username);
          setPassword("");
          setConfirm("");
          setPFocus(false);
          setCFocus(false);
          setMode("login");
        } else {
          setPassword("");
          onSuccess();
          onClose();
        }
      } else {
        setError(data.message || (mode === "login" ? "Invalid admin credentials" : "Registration failed"));
      }
    } catch {
      setError("Server connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitLabel =
    mode === "login" ? (loading ? "Verifying…" : "Authenticate Admin") : loading ? "Creating…" : "Register Admin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="glass-card rounded-2xl max-w-md w-full shadow-2xl relative text-slate-100 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500" />

        <div className="p-6">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white leading-tight">
                {mode === "login" ? "Administrator Portal" : "Register New Admin"}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {mode === "login"
                  ? "Sign in to manage staff, logs & policies"
                  : "Create an administrator account"}
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800 mb-5">
            <span
              className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-amber-600 shadow-md transition-transform duration-300 ease-out ${
                mode === "register" ? "translate-x-[calc(100%+0.5rem)]" : "translate-x-0"
              }`}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`relative z-10 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-colors ${
                mode === "login" ? "text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`relative z-10 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-colors ${
                mode === "register" ? "text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-200 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Admin Username
              </label>
              <input
                type="text"
                required
                autoFocus
                name="admin-user-field"
                autoComplete="off"
                data-lpignore="true"
                readOnly={!uFocus}
                onFocus={() => setUFocus(true)}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/60 transition"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                name="admin-pass-field"
                autoComplete="new-password"
                data-lpignore="true"
                readOnly={!pFocus}
                onFocus={() => setPFocus(true)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/60 transition tracking-wider"
                placeholder="Enter password"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  name="admin-confirm-field"
                  autoComplete="new-password"
                  data-lpignore="true"
                  readOnly={!cFocus}
                  onFocus={() => setCFocus(true)}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`w-full bg-slate-800 border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition tracking-wider ${
                    confirm && confirm !== password ? "border-rose-600/70" : "border-slate-700"
                  }`}
                  placeholder="Re-enter password"
                />
                {confirm && confirm !== password && (
                  <p className="text-[11px] text-rose-400 mt-1">Passwords do not match.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
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
                className="px-5 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg transition shadow-md disabled:opacity-50 active:scale-95 flex items-center gap-1.5"
              >
                {mode === "register" ? <UserPlus className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
