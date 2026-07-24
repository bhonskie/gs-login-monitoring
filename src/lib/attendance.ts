export interface AttendanceSummary {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  undertimeHours: number;
  status: "LOGGED_IN" | "COMPLETED" | "OVERTIME" | "UNDERTIME" | "HALF_DAY" | "INCOMPLETE";
  displayText: string;
}

/**
 * Employee remark option list (Employee Directory Remarks column & filter)
 */
export const EMPLOYEE_REMARKS = [
  "Vacation Leave",
  "Sick Leave",
  "Emergency Leave",
  "Maternity Leave",
  "Paternity Leave",
  "Disconnected / ISP Issue",
  "Power Interruption",
  "Internet Maintenance",
];

/**
 * Visual status detection for an attendance record:
 * - Login exists but logout missing (and the log's day already ended) → Incomplete Attendance / Missing Log Out
 * - Logout exists but login missing → Incomplete Attendance / Missing Log In
 * - Worked only half (≤ 4.0 hrs) of the 8-hr schedule → Half Day
 */
export interface DerivedAttendanceStatus {
  key: AttendanceSummary["status"];
  text: string;
  remark: "Missing Log Out" | "Missing Log In" | null;
  className: string;
}

const TONE_CLASSES: Record<string, string> = {
  incomplete:
    "px-2.5 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800/70 text-[11px] font-semibold w-max",
  halfday:
    "px-2.5 py-1 rounded bg-purple-950/80 text-purple-300 border border-purple-800/70 text-[11px] font-semibold w-max",
  overtime:
    "px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[11px] font-semibold w-max",
  undertime:
    "px-2.5 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 text-[11px] font-semibold w-max",
  completed:
    "px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px] font-semibold w-max",
  active:
    "px-2.5 py-1 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[11px] font-semibold w-max",
};

export function deriveAttendanceStatusVisual(rec: {
  timeIn?: Date | string | null;
  timeOut?: Date | string | null;
  status?: string | null;
  targetDate?: string | null;
  date?: string | null;
  regularHours?: number | null;
  overtimeHours?: number | null;
  undertimeHours?: number | null;
  totalHours?: number | null;
}): DerivedAttendanceStatus {
  const todayIso = toIsoDate(new Date());
  const logDateIso = rec.targetDate || rec.date || todayIso;
  const hasIn = !!rec.timeIn;
  const hasOut = !!rec.timeOut;

  // 9–10. Incomplete Attendance (missing clock in/out)
  if (!hasIn && hasOut) {
    return {
      key: "INCOMPLETE",
      text: "⚠ Incomplete Attendance — Missing Log In",
      remark: "Missing Log In",
      className: TONE_CLASSES.incomplete,
    };
  }

  if (hasIn && !hasOut) {
    // Only flag Missing Log Out once the shift's own date has passed (today is still in progress)
    if (logDateIso < todayIso) {
      return {
        key: "INCOMPLETE",
        text: "⚠ Incomplete Attendance — Missing Log Out",
        remark: "Missing Log Out",
        className: TONE_CLASSES.incomplete,
      };
    }
    return {
      key: "LOGGED_IN",
      text: "Shift Active",
      remark: null,
      className: TONE_CLASSES.active,
    };
  }

  switch (rec.status) {
    case "OVERTIME":
      return {
        key: "OVERTIME",
        text: `Completed ${(rec.regularHours ?? 8).toFixed(1)} hrs + ${(rec.overtimeHours || 0).toFixed(1)} hrs. OT`,
        remark: null,
        className: TONE_CLASSES.overtime,
      };
    case "UNDERTIME":
      return {
        key: "UNDERTIME",
        text: `${(rec.undertimeHours || 0).toFixed(1)} hrs. undertime`,
        remark: null,
        className: TONE_CLASSES.undertime,
      };
    case "HALF_DAY":
      return {
        key: "HALF_DAY",
        text: `Half Day (${(rec.totalHours || 0).toFixed(1)} hrs worked)`,
        remark: null,
        className: TONE_CLASSES.halfday,
      };
    default:
      return {
        key: "COMPLETED",
        text: "Completed 8.0 hrs",
        remark: null,
        className: TONE_CLASSES.completed,
      };
  }
}

/**
 * Standard duty schedule (8.0 hr windows fixed to the duty time list):
 * - 12:00 am duty → ends 8:00 am
 * - 2:00 am duty  → ends 10:00 am
 * - 3:00 am duty  → ends 11:00 am
 */
export const DUTY_SCHEDULE: Record<string, { start: string; end: string }> = {
  "12:00 am": { start: "12:00 am", end: "8:00 am" },
  "2:00 am": { start: "2:00 am", end: "10:00 am" },
  "3:00 am": { start: "3:00 am", end: "11:00 am" },
};

/**
 * Computes attendance against the FIXED duty schedule window:
 *   duty window = dutyStartUtc .. dutyStartUtc + 8.0 hrs (e.g. 12:00 am – 8:00 am)
 *
 * - Regular hours  : time worked INSIDE the duty window (late log-ins lose their
 *                    late portion; max 8.0 hrs)
 * - Overtime hours : time worked AFTER the scheduled duty end
 * - Undertime      : scheduled hours missed by logging OUT before the duty end
 * - Late minutes   : tracked separately at clock-in (not double-counted in UT)
 */
export function calculateDutyShiftSummary(
  timeIn: Date,
  timeOut: Date | null | undefined,
  dutyStartUtc: Date
): AttendanceSummary {
  if (!timeOut) {
    return {
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      undertimeHours: 0,
      status: "LOGGED_IN",
      displayText: "Currently Logged In (Shift In Progress)",
    };
  }

  const HOUR = 1000 * 60 * 60;
  const dutyEndUtc = new Date(getExpectedDutyEnd(dutyStartUtc));
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const totalHours = round2(Math.max(0, timeOut.getTime() - timeIn.getTime()) / HOUR);

  // Hours worked inside the scheduled duty window
  const windowIn = Math.max(timeIn.getTime(), dutyStartUtc.getTime());
  const windowOut = Math.min(timeOut.getTime(), dutyEndUtc.getTime());
  const regularHours = round2(Math.min(8, Math.max(0, windowOut - windowIn) / HOUR));

  // Overtime: after the fixed duty end (e.g. past 8:00 am for 12:00 am duty)
  const overtimeHours = round2(Math.max(0, timeOut.getTime() - dutyEndUtc.getTime()) / HOUR);

  // Undertime: logged out before the fixed duty end
  const undertimeHours = round2(Math.max(0, dutyEndUtc.getTime() - timeOut.getTime()) / HOUR);

  let status: AttendanceSummary["status"];
  let displayText: string;

  if (overtimeHours > 0) {
    status = "OVERTIME";
    displayText = `Completed ${regularHours.toFixed(1)} hrs (duty window) plus ${overtimeHours.toFixed(1)} hrs. OT`;
  } else if (totalHours <= 4.0) {
    // Employee worked only half (or less) of the 8-hr scheduled hours → Half Day
    status = "HALF_DAY";
    displayText = `Half Day (Worked only ${totalHours.toFixed(1)} hrs of 8.0 hrs scheduled)`;
  } else if (undertimeHours > 0) {
    status = "UNDERTIME";
    displayText = `${undertimeHours.toFixed(1)} hrs. undertime (Worked ${totalHours.toFixed(1)} hrs)`;
  } else {
    status = "COMPLETED";
    displayText = "Completed 8.0 hrs duty window";
  }

  return {
    totalHours,
    regularHours,
    overtimeHours,
    undertimeHours,
    status,
    displayText,
  };
}

/**
 * Scheduled duty end instant (duty start + 8.0 hrs).
 */
export function getExpectedDutyEnd(dutyStartUtc: Date): Date {
  return new Date(dutyStartUtc.getTime() + 8 * 60 * 60 * 1000);
}

/**
 * Format timestamp to friendly time string (e.g. 7:00 AM)
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "--:--";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

/**
 * Get YYYY-MM-DD string from Date in the APP timezone (UTC+8 by default).
 * Use this for recording log-in/log-out dates so records show on the correct
 * local day for Everyday / Weekly / Monthly reporting.
 */
export function toAppIsoDate(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + APP_TZ_OFFSET_MINUTES * 60000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format timestamp to friendly date string (e.g. Feb 24, 2026)
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const d = typeof dateStr === "string" && !dateStr.includes("T") ? new Date(dateStr + "T00:00:00") : new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Get YYYY-MM-DD string from Date in the SERVER'S local timezone
 */
export function toIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}



/**
 * Parse a duty time option like "12:00 am", "2:00 am", "3:00 am" into 24h components.
 */
export function parseDutyTime(dutyTime: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(String(dutyTime || "").trim());
  if (!match) return { hours: 0, minutes: 0 };
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toLowerCase();
  if (meridiem === "am") {
    if (hours === 12) hours = 0;
  } else {
    if (hours !== 12) hours += 12;
  }
  return { hours, minutes };
}

/**
 * Application display/computation timezone offset from UTC in minutes.
 * Default 480 = UTC+8 (Philippine Time). Configurable via APP_TIMEZONE_OFFSET_MINUTES.
 */
export const APP_TZ_OFFSET_MINUTES = Number(
  process.env.APP_TIMEZONE_OFFSET_MINUTES ?? 8 * 60
);

/**
 * Format an instant using the application timezone (not the server/browser timezone),
 * so server-side messages match the time users see in the app.
 */
export function formatTimeTz(date: Date | string | null | undefined): string {
  if (!date) return "--:--";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "--:--";
  const shifted = new Date(d.getTime() + APP_TZ_OFFSET_MINUTES * 60000);
  let h = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${mer}`;
}

/**
 * Expected shift start instant: the duty time option (e.g. "12:00 am") on the
 * log target date, interpreted in the application timezone (UTC+8 by default),
 * returned as a true UTC instant for correct comparison with stored timestamps.
 */
export function getExpectedDutyStart(targetDateIso: string, dutyTime: string): Date {
  const { hours, minutes } = parseDutyTime(dutyTime);
  const hm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const utcMs = Date.parse(`${targetDateIso}T${hm}:00Z`);
  if (isNaN(utcMs)) return new Date(NaN);
  return new Date(utcMs - APP_TZ_OFFSET_MINUTES * 60000);
}

/**
 * Minutes the employee is late (0 when on time or early), based on the actual
 * log-in instant vs expected duty time on the log target date (app timezone).
 */
export function computeLateMinutes(
  timeIn: Date,
  targetDateIso: string,
  dutyTime: string
): number {
  if (!targetDateIso || !dutyTime) return 0;
  const expectedStart = getExpectedDutyStart(targetDateIso, dutyTime);
  if (isNaN(expectedStart.getTime())) return 0;
  const diffMinutes = (timeIn.getTime() - expectedStart.getTime()) / (1000 * 60);
  return diffMinutes > 0 ? Math.round(diffMinutes) : 0;
}

/**
 * Human friendly late label (e.g. "25 min late", "1.5 hrs late")
 */
export function formatlate(minutes: number): string {
  if (!minutes || minutes <= 0) return "On Time";
  if (minutes < 60) return `${Math.round(minutes)} min late`;
  const hrs = minutes / 60;
  return `${hrs.toFixed(1)} hrs late`;
}
