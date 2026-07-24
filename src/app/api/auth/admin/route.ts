import { NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/admin-auth";

const DEFAULT_USER = process.env.ADMIN_USERNAME || "admin";
const DEFAULT_PASS = process.env.ADMIN_PASSWORD || "admin123";

/** Ensure a bootstrap admin exists on a fresh install (silent; banner removed from UI). */
async function ensureBootstrap() {
  const rows = await db.select().from(admins);
  if (rows.length === 0) {
    try {
      await db
        .insert(admins)
        .values({ username: DEFAULT_USER, passwordHash: hashPassword(DEFAULT_PASS) })
        .onConflictDoNothing();
    } catch {
      // concurrent bootstrap — ignore, the other call wins
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action === "register" ? "register" : "login";
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const confirm = body.confirm !== undefined ? String(body.confirm) : null;

    if (action === "register") {
      if (username.length < 3) {
        return NextResponse.json(
          { success: false, message: "Username must be at least 3 characters." },
          { status: 400 }
        );
      }
      if (password.length < 6) {
        return NextResponse.json(
          { success: false, message: "Password must be at least 6 characters." },
          { status: 400 }
        );
      }
      if (confirm !== null && confirm !== password) {
        return NextResponse.json(
          { success: false, message: "Passwords do not match." },
          { status: 400 }
        );
      }
      const existing = await db.select().from(admins).where(eq(admins.username, username));
      if (existing.length > 0) {
        return NextResponse.json(
          { success: false, message: "That admin username is already taken. Choose another." },
          { status: 409 }
        );
      }
      await db.insert(admins).values({ username, passwordHash: hashPassword(password) });
      return NextResponse.json({
        success: true,
        registered: true,
        message: `Admin account "${username}" created. You can now sign in.`,
      });
    }

    // login
    await ensureBootstrap();
    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Enter your admin username and password." },
        { status: 401 }
      );
    }
    const rows = await db.select().from(admins).where(eq(admins.username, username));
    const row = rows[0];
    if (!row || !verifyPassword(password, row.passwordHash)) {
      return NextResponse.json(
        { success: false, message: "Invalid admin username or password." },
        { status: 401 }
      );
    }
    return NextResponse.json({
      success: true,
      user: { username: row.username, role: "Administrator", name: "System Admin" },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
