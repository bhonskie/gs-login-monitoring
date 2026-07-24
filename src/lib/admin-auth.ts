import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 64;
const SCRYPT_COST = 16384; // N
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** Hash a password with a random salt using scrypt. Stored as `salt$hash` (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_COST,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `${salt}$${derived}`;
}

/** Verify a plaintext password against a stored `salt$hash` value (constant-time). */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.includes("$")) return false;
  const [salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) return false;
  try {
    const derived = scryptSync(password, salt, KEY_LEN, {
      N: SCRYPT_COST,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
