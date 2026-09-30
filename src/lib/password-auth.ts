import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getAllowedEmails } from "@/lib/auth-allowlist";
import { isFounderEmail } from "@/lib/founder";
import { isMagicLinkEmailAuthorized, normalizeEmail } from "@/lib/magic-link";
import { prisma } from "@/lib/prisma";

/**
 * Email + password accounts, so a shop can sign up and be inside in one step.
 *
 * Signing up does not prove the address, so an unverified login must never
 * inherit anything that address already had or is later granted by someone
 * else: shops created before it, team invites, founder or allowlist access.
 * Proof of the address (Google, an emailed link) drops an unverified login.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_FAILURES = 10;
const LOCK_MINUTES = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const key = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "That password is too long.";
  return null;
}

/** Access the address holds that an unproven signup must not be able to claim. */
async function heldByAddress(email: string, since?: Date): Promise<boolean> {
  if (isFounderEmail(email) || getAllowedEmails().includes(email)) return true;
  const [shop, membership] = await Promise.all([
    prisma.business.findFirst({
      where: { ownerEmail: email, ...(since ? { createdAt: { lt: since } } : {}) },
      select: { id: true },
    }),
    prisma.membership.findFirst({ where: { email }, select: { id: true } }),
  ]);
  return Boolean(shop || membership);
}

export type SignUpResult =
  | { ok: true; email: string }
  | {
      ok: false;
      reason: "invalid-email" | "weak-password" | "closed" | "exists" | "claimed";
      message: string;
    };

export async function createPasswordAccount(
  rawEmail: string,
  password: string,
  options: { publicSignupReady?: boolean } = {},
): Promise<SignUpResult> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, reason: "invalid-email", message: "Enter a valid email address." };
  }
  const weak = passwordProblem(password);
  if (weak) return { ok: false, reason: "weak-password", message: weak };
  if (!isMagicLinkEmailAuthorized(email, options.publicSignupReady)) {
    return { ok: false, reason: "closed", message: "Signup isn't open yet." };
  }
  if (await heldByAddress(email)) {
    return {
      ok: false,
      reason: "claimed",
      message: "That email already has an Orvius workspace. Sign in with Google, or use “Forgot password?”.",
    };
  }

  const passwordHash = await hashPassword(password);
  try {
    await prisma.passwordLogin.create({ data: { email, passwordHash } });
  } catch {
    return {
      ok: false,
      reason: "exists",
      message: "That email already has an account. Sign in instead.",
    };
  }
  return { ok: true, email };
}

/** Returns the email on a correct password, null for anything else. */
export async function verifyPasswordLogin(rawEmail: string, password: string): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  if (!email || !password || password.length > MAX_PASSWORD_LENGTH) return null;

  const login = await prisma.passwordLogin.findUnique({ where: { email } });
  if (!login) {
    // Same cost as a real check, so response time doesn't reveal which emails exist.
    await hashPassword(password);
    return null;
  }
  if (login.lockedUntil && login.lockedUntil.getTime() > Date.now()) return null;

  if (!(await verifyPasswordHash(password, login.passwordHash))) {
    const failedCount = login.failedCount + 1;
    await prisma.passwordLogin.update({
      where: { id: login.id },
      data:
        failedCount >= MAX_FAILURES
          ? { failedCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedCount },
    });
    return null;
  }

  if (!login.verifiedAt && (await heldByAddress(email, login.createdAt))) return null;

  if (login.failedCount || login.lockedUntil) {
    await prisma.passwordLogin.update({
      where: { id: login.id },
      data: { failedCount: 0, lockedUntil: null },
    });
  }
  return email;
}

/**
 * Called when someone proves they own the address by another route. A password
 * nobody has proven could belong to whoever typed the address first, so it goes.
 */
export async function dropUnverifiedPassword(rawEmail: string): Promise<void> {
  await prisma.passwordLogin.deleteMany({
    where: { email: normalizeEmail(rawEmail), verifiedAt: null },
  });
}

/** Set or replace the password for an address the caller has already proven. */
export async function setVerifiedPassword(
  rawEmail: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const weak = passwordProblem(password);
  if (weak) return { ok: false, message: weak };
  const email = normalizeEmail(rawEmail);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await prisma.passwordLogin.upsert({
    where: { email },
    create: { email, passwordHash, verifiedAt: now },
    update: { passwordHash, verifiedAt: now, failedCount: 0, lockedUntil: null },
  });
  return { ok: true };
}
