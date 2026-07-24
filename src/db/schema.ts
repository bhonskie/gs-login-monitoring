import { pgTable, serial, text, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  position: text("position").notNull(),
  pin: text("pin").notNull(),
  email: text("email"),
  dutyTime: text("duty_time"),
  expectedDutyTime: text("expected_duty_time"),
  dayOff: text("day_off"),
  remark: text("remark"),
  avatarColor: text("avatar_color").default("bg-blue-600"),
  status: text("status").notNull().default("Active"),
  accountStatus: text("account_status").notNull().default("ACTIVE"), // ACTIVE | LOCKED
  lockedAt: timestamp("locked_at"),
  lockReason: text("lock_reason"),
  unlockReason: text("unlock_reason"),
  unlockAdmin: text("unlock_admin"),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Registered administrator accounts (passwords stored as scrypt salt$hash)
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  timeIn: timestamp("time_in"), // nullable: Missing Log In records (logout without login)
  expectedTimeOut: timestamp("expected_time_out").notNull(),
  timeOut: timestamp("time_out"),
  targetDate: text("target_date").notNull(), // Logging Target Date
  targetDutyTime: text("target_duty_time"), // Target duty time at clock-in
  lateMinutes: real("late_minutes").default(0), // Minutes logged in after expected duty time (0 = on time)
  totalHours: real("total_hours").default(0),
  regularHours: real("regular_hours").default(0),
  overtimeHours: real("overtime_hours").default(0),
  undertimeHours: real("undertime_hours").default(0),
  status: text("status").notNull().default("LOGGED_IN"), // LOGGED_IN, OVERTIME, UNDERTIME, COMPLETED
  notes: text("notes"),
  location: text("location").default("Main Office / Online"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Daily remark records: which day a remark is marked for an employee
export const employeeRemarks = pgTable("employee_remarks", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD (day the remark is marked on)
  remark: text("remark").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auto-generated Attendance Warning Notices (Warning History per employee)
export const warnings = pgTable("warnings", {
  id: serial("id").primaryKey(),
  warningNo: text("warning_no").notNull().unique(), // e.g. WN-2026-0001
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  employeeCode: text("employee_code").notNull(),
  employeeName: text("employee_name").notNull(),
  empLevel: text("emp_level").notNull(),
  position: text("position").notNull(),
  supervisor: text("supervisor"),
  absentDates: text("absent_dates").notNull(), // comma-separated consecutive absent dates
  anchorDate: text("anchor_date").notNull(), // most recent consecutive absent day (idempotency key)
  consecutiveCount: integer("consecutive_count").notNull(),
  warningLevel: text("warning_level").notNull(), // Verbal Warning | Written Warning | Final Written Warning
  reason: text("reason").notNull(),
  emailSent: boolean("email_sent").notNull().default(false),
  emailError: text("email_error"),
  issuedBy: text("issued_by").notNull().default("System"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit trail for admin actions (locks, unlocks, break edits, policy changes)
export const auditTrail = pgTable("audit_trail", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(), // AUTO_LOCK_ACCOUNT | UNLOCK_ACCOUNT | AUTO_WARNING_ISSUED | EDIT_BREAK_RECORD | OVERRIDE_BREAK_VIOLATION | UPDATE_BREAK_POLICY
  employeeCode: text("employee_code"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Employee break records (Start / Done Break tracking)
export const breaks = pgTable("breaks", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  attendanceId: integer("attendance_id"), // linked shift id when relevant
  date: text("date").notNull(), // YYYY-MM-DD (app local day)
  breakType: text("break_type").notNull().default("Coffee Break"), // "Meal Break" | "Coffee Break"
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationMinutes: real("duration_minutes").notNull().default(0),
  status: text("status").notNull().default("ON_BREAK"), // ON_BREAK | DONE
  violation: text("violation"), // e.g. "Exceeded by 13 min" | "Unauthorized extra Coffee Break" | "Not ended before logout"
  location: text("location"),
  deviceName: text("device_name"),
  ipAddress: text("ip_address"),
  overriddenAt: timestamp("overridden_at"),
  overrideReason: text("override_reason"),
  overrideBy: text("override_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Single-row break policy configuration (admin-configurable)
export const breakPolicies = pgTable("break_policies", {
  id: serial("id").primaryKey(),
  mealsCount: integer("meals_count").notNull().default(1), // unpaid meal breaks per day
  mealMinutes: integer("meal_minutes").notNull().default(60),
  mealPaid: boolean("meal_paid").notNull().default(false),
  coffeeCount: integer("coffee_count").notNull().default(2), // paid coffee breaks per day
  coffeeMinutes: integer("coffee_minutes").notNull().default(15),
  coffeePaid: boolean("coffee_paid").notNull().default(true),
  graceMinutes: integer("grace_minutes").notNull().default(5),
  mealRequired: boolean("meal_required").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
export type EmployeeRemarkRecord = typeof employeeRemarks.$inferSelect;
export type NewEmployeeRemarkRecord = typeof employeeRemarks.$inferInsert;
export type BreakRecord = typeof breaks.$inferSelect;
export type BreakPolicy = typeof breakPolicies.$inferSelect;
export type AdminAccount = typeof admins.$inferSelect;
