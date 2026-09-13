import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isEmailAllowed } from "@/lib/auth-allowlist";
import { company } from "@/lib/company";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * Passwordless sign-in links.
 *
 * The row stores only the SHA-256 of the token, so a database dump is not a
 * pile of working logins. Tokens are single-use (claimed with a conditional
 * update, which is atomic in SQLite) and short-lived, and the allowlist is
 * re-checked at redemption rather than only at issue — the set of authorised
 * owners can change inside the link's lifetime.
 */

export const LINK_TTL_MINUTES = 10;
const MAX_LINKS_PER_WINDOW = 3;
const RATE_WINDOW_MINUTES = 15;

export type IssueResult =
  | { ok: true; email: string; token: string }
  | { ok: false; reason: "invalid-email" | "not-allowed" | "rate-limited" };

/** Deliberately strict: this address has to survive a round trip through email. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildMagicLinkUrl(token: string) {
  const url = new URL("/signin/verify", getAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export async function issueMagicLink(rawEmail: string): Promise<IssueResult> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, reason: "invalid-email" };
  }
  if (!isEmailAllowed(email)) {
    return { ok: false, reason: "not-allowed" };
  }

  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000);
  const recent = await prisma.loginToken.count({
    where: { email, createdAt: { gte: since } },
  });
  if (recent >= MAX_LINKS_PER_WINDOW) {
    return { ok: false, reason: "rate-limited" };
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: {
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LINK_TTL_MINUTES * 60_000),
    },
  });

  // Housekeeping is cheap here and keeps the table from growing without bound.
  await prisma.loginToken
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } })
    .catch(() => undefined);

  return { ok: true, email, token };
}

/**
 * Claim a token. Returns the email on success and null for anything else —
 * expired, already used, unknown, or an address that has since lost access.
 */
export async function consumeMagicLink(token: string): Promise<string | null> {
  if (!token || token.length > 512) return null;

  const record = await prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record) return null;

  // Constant-time compare on the hash as well, so a partial-match oracle in the
  // index lookup cannot be widened by timing.
  const presented = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(record.tokenHash, "hex");
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) {
    return null;
  }

  if (record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  if (!isEmailAllowed(record.email)) return null;

  // Conditional update: whoever flips usedAt first wins, so a link replayed in
  // two tabs authenticates exactly once.
  const claimed = await prisma.loginToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  return record.email;
}

export function buildMagicLinkEmail(link: string) {
  return {
    subject: `Your ${company.productName} sign-in link`,
    text: [
      `Sign in to ${company.productName}:`,
      "",
      link,
      "",
      `This link works once and expires in ${LINK_TTL_MINUTES} minutes.`,
      "If you did not request it, you can ignore this email — no one can sign in without opening the link.",
    ].join("\n"),
  };
}
