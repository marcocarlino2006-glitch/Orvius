import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { renderSVG } from "uqr";

import { normalizeEmail } from "@/lib/magic-link";
import { prisma } from "@/lib/prisma";

/**
 * Two-step sign-in: an authenticator-app code (RFC 6238 TOTP, 30s, 6 digits)
 * on top of a password or an email link. Recovery codes are the way back in
 * when the phone is lost. Google sign-in relies on Google's own 2-Step
 * Verification, and the settings page says so.
 *
 * Secrets are sealed under AUTH_SECRET: rotating it signs everyone out anyway,
 * and owners with two-step then use a recovery code once.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_COUNT = 10;
const ISSUER = "Orvius";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("Not base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, "0");
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** The step a code matches within one step of drift either way, or null. */
export function matchTotp(secret: Buffer, code: string, now = Date.now()) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    const expected = totpAt(secret, s);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
  }
  return null;
}

function boxKey() {
  const raw = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!raw) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`orvius-two-step:${raw}`).digest();
}

function seal(secret: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", boxKey(), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `ts1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

function open(sealed: string): Buffer | null {
  if (!sealed.startsWith("ts1:")) return null;
  try {
    const buf = Buffer.from(sealed.slice(4), "base64");
    const decipher = createDecipheriv("aes-256-gcm", boxKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  } catch {
    return null;
  }
}

const hashRecovery = (code: string) =>
  createHash("sha256").update(`orvius-recovery:${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`).digest("hex");

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_COUNT }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export async function twoStepEnabled(rawEmail: string) {
  const row = await prisma.twoStep.findUnique({ where: { email: normalizeEmail(rawEmail) }, select: { enabledAt: true } });
  return Boolean(row?.enabledAt);
}

export async function twoStepStatus(rawEmail: string) {
  const row = await prisma.twoStep.findUnique({
    where: { email: normalizeEmail(rawEmail) },
    select: { enabledAt: true, recoveryHashesJson: true },
  });
  return {
    enabled: Boolean(row?.enabledAt),
    enabledAt: row?.enabledAt?.toISOString() ?? null,
    recoveryLeft: row?.enabledAt ? (JSON.parse(row.recoveryHashesJson) as string[]).length : 0,
  };
}

/** A fresh secret, not enforced until confirmed. Replaces any unconfirmed one; refuses while on. */
export async function startTwoStep(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const existing = await prisma.twoStep.findUnique({ where: { email }, select: { enabledAt: true } });
  if (existing?.enabledAt) return { ok: false as const, error: "Two-step sign-in is already on." };
  const secret = randomBytes(20);
  await prisma.twoStep.upsert({
    where: { email },
    create: { email, secretSealed: seal(secret) },
    update: { secretSealed: seal(secret), recoveryHashesJson: "[]", lastStep: 0 },
  });
  const key = base32Encode(secret);
  const uri = `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?secret=${key}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  const svg = renderSVG(uri, { border: 2 });
  return {
    ok: true as const,
    setupKey: key.match(/.{1,4}/g)!.join(" "),
    uri,
    qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}

type CodeCheck = { ok: true; via: "app" | "recovery" } | { ok: false };

/** Accepts an app code (never the same step twice) or an unused recovery code, which is then spent. */
async function checkCode(email: string, code: string, requireEnabled: boolean): Promise<CodeCheck> {
  const row = await prisma.twoStep.findUnique({ where: { email } });
  if (!row || (requireEnabled && !row.enabledAt)) return { ok: false };
  const secret = open(row.secretSealed);
  const step = secret ? matchTotp(secret, code) : null;
  if (step != null) {
    if (step <= row.lastStep) return { ok: false };
    const claimed = await prisma.twoStep.updateMany({ where: { id: row.id, lastStep: { lt: step } }, data: { lastStep: step } });
    return claimed.count === 1 ? { ok: true, via: "app" } : { ok: false };
  }
  if (!row.enabledAt) return { ok: false };
  const hashes = JSON.parse(row.recoveryHashesJson) as string[];
  const hit = hashRecovery(code);
  if (!hashes.includes(hit)) return { ok: false };
  const claimed = await prisma.twoStep.updateMany({
    where: { id: row.id, recoveryHashesJson: row.recoveryHashesJson },
    data: { recoveryHashesJson: JSON.stringify(hashes.filter((h) => h !== hit)) },
  });
  return claimed.count === 1 ? { ok: true, via: "recovery" } : { ok: false };
}

/** Confirms the app with its first code and hands back recovery codes, shown once. */
export async function confirmTwoStep(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  const row = await prisma.twoStep.findUnique({ where: { email }, select: { enabledAt: true } });
  if (!row) return { ok: false as const, error: "Start again: scan the new code first." };
  if (row.enabledAt) return { ok: false as const, error: "Two-step sign-in is already on." };
  if (!(await checkCode(email, code, false)).ok) {
    return { ok: false as const, error: "That code didn't match. Use the 6 digits showing in your app right now." };
  }
  const codes = newRecoveryCodes();
  await prisma.twoStep.update({
    where: { email },
    data: { enabledAt: new Date(), recoveryHashesJson: JSON.stringify(codes.map(hashRecovery)) },
  });
  return { ok: true as const, recoveryCodes: codes };
}

/** For sign-in and for turning it off: a current app code or a recovery code. */
export async function verifyTwoStepCode(rawEmail: string, code: string) {
  return checkCode(normalizeEmail(rawEmail), code, true);
}

export async function disableTwoStep(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  if (!(await verifyTwoStepCode(email, code)).ok) {
    return { ok: false as const, error: "That code didn't match. Use your app's current code or a recovery code." };
  }
  await prisma.twoStep.delete({ where: { email } });
  return { ok: true as const };
}

export async function regenerateRecoveryCodes(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  if (!(await verifyTwoStepCode(email, code)).ok) {
    return { ok: false as const, error: "That code didn't match. Use your app's current code." };
  }
  const codes = newRecoveryCodes();
  await prisma.twoStep.update({ where: { email }, data: { recoveryHashesJson: JSON.stringify(codes.map(hashRecovery)) } });
  return { ok: true as const, recoveryCodes: codes };
}
