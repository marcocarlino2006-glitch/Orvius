import { createHash, randomBytes } from "node:crypto";

import { revokeAllSessions, sendSecurityNotice } from "@/lib/account-security";
import { recordAudit } from "@/lib/audit";
import { company } from "@/lib/company";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { normalizeEmail } from "@/lib/magic-link";
import { verifyPasswordHash } from "@/lib/password-auth";
import { prisma } from "@/lib/prisma";
import { verifyTwoStepCode } from "@/lib/two-step";

/*
  Moving a sign-in to a new address. The signed-in person proves it is them
  (password and two-step when they have them), the new inbox proves it is
  theirs by opening a link, and the old inbox is told at both steps. Nothing
  moves until the link is opened.
*/

export const EMAIL_CHANGE_TTL_MINUTES = 60;
const MAX_REQUESTS_PER_HOUR = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function buildEmailChangeUrl(token: string) {
  const url = new URL("/account/email", getAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

/** True when the address already signs in somewhere, so two people never end up sharing one sign-in. */
export async function emailInUse(email: string): Promise<boolean> {
  const [owner, member, login, twoStep] = await Promise.all([
    prisma.business.findFirst({ where: { ownerEmail: email }, select: { id: true } }),
    prisma.membership.findFirst({ where: { email }, select: { id: true } }),
    prisma.passwordLogin.findFirst({ where: { email, verifiedAt: { not: null } }, select: { id: true } }),
    prisma.twoStep.findFirst({ where: { email, enabledAt: { not: null } }, select: { id: true } }),
  ]);
  return Boolean(owner || member || login || twoStep);
}

export type RequestResult =
  | { ok: true; toEmail: string; token: string }
  | { ok: false; status: number; error: string };

export async function requestEmailChange(input: {
  fromEmail: string;
  toEmail: string;
  password?: string;
  code?: string;
  now?: Date;
}): Promise<RequestResult> {
  const now = input.now ?? new Date();
  const fromEmail = normalizeEmail(input.fromEmail);
  const toEmail = normalizeEmail(input.toEmail);
  if (!EMAIL_PATTERN.test(toEmail) || toEmail.length > 254) {
    return { ok: false, status: 400, error: "That email address doesn't look right." };
  }
  if (toEmail === fromEmail) return { ok: false, status: 400, error: "That's already your sign-in email." };

  const login = await prisma.passwordLogin.findUnique({ where: { email: fromEmail } });
  if (login && !(input.password && (await verifyPasswordHash(input.password, login.passwordHash)))) {
    return { ok: false, status: 400, error: "Your current password didn't match." };
  }
  const twoStep = await prisma.twoStep.findUnique({ where: { email: fromEmail }, select: { enabledAt: true } });
  if (twoStep?.enabledAt && !(input.code && (await verifyTwoStepCode(fromEmail, input.code)).ok)) {
    return { ok: false, status: 400, error: "That code didn't match. Use your app's current code or a recovery code." };
  }

  if (await emailInUse(toEmail)) {
    return { ok: false, status: 409, error: "That address already has an Orvius sign-in. Use a different one." };
  }
  const recent = await prisma.emailChange.count({
    where: { fromEmail, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    return { ok: false, status: 429, error: "Too many change requests. Wait an hour and try again." };
  }
  if (!isEmailConfigured()) {
    return { ok: false, status: 503, error: `Email isn't sending right now, so the change can't be confirmed. Write to ${company.supportEmail}.` };
  }

  // Only the newest link works, so an older one sitting in some inbox is dead.
  await prisma.emailChange.updateMany({ where: { fromEmail, usedAt: null }, data: { expiresAt: now } });
  const token = randomBytes(32).toString("base64url");
  await prisma.emailChange.create({
    data: {
      fromEmail,
      toEmail,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TTL_MINUTES * 60_000),
      createdAt: now,
    },
  });

  try {
    await sendOwnerEmail({
      to: toEmail,
      subject: `Confirm your new ${company.productName} sign-in email`,
      text: [
        `${fromEmail} asked to move their ${company.productName} sign-in to this address.`,
        "",
        "Confirm it here:",
        buildEmailChangeUrl(token),
        "",
        `The link works once and expires in ${EMAIL_CHANGE_TTL_MINUTES} minutes. If you didn't expect this, ignore it and nothing changes.`,
        "",
        "— Orvius",
      ].join("\n"),
    });
  } catch (error) {
    logWarn("email_change.link_failed", { error: error instanceof Error ? error.message : String(error) });
    await prisma.emailChange.updateMany({ where: { tokenHash: hashToken(token) }, data: { expiresAt: now } });
    return { ok: false, status: 502, error: "The confirmation email didn't send. Nothing changed. Try again in a minute." };
  }
  await sendSecurityNotice(fromEmail, "email_change_requested", { now, detail: `New address: ${toEmail}` });
  return { ok: true, toEmail, token };
}

export async function peekEmailChange(token: string, now = new Date()) {
  if (!token || token.length > 512) return null;
  const row = await prisma.emailChange.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  return { fromEmail: row.fromEmail, toEmail: row.toEmail };
}

export type ConfirmResult =
  | { ok: true; fromEmail: string; toEmail: string; shops: number }
  | { ok: false; error: string };

export async function confirmEmailChange(token: string, now = new Date()): Promise<ConfirmResult> {
  const expired = { ok: false as const, error: "This link has expired or was already used. Sign in and start the change again." };
  if (!token || token.length > 512) return expired;
  const row = await prisma.emailChange.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return expired;
  const { fromEmail, toEmail } = row;
  if (await emailInUse(toEmail)) {
    return { ok: false, error: "That address got its own Orvius sign-in since the change was asked for, so nothing moved." };
  }

  const claimed = await prisma.emailChange.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return expired;

  const [owned, memberships] = await Promise.all([
    prisma.business.findMany({ where: { ownerEmail: fromEmail }, select: { id: true, stripeCustomerId: true } }),
    prisma.membership.findMany({ where: { email: fromEmail }, select: { businessId: true } }),
  ]);

  await prisma.$transaction([
    // An unproven password someone set up for the new address must not survive into the moved account.
    prisma.passwordLogin.deleteMany({ where: { email: toEmail } }),
    prisma.twoStep.deleteMany({ where: { email: toEmail } }),
    prisma.sessionRevocation.deleteMany({ where: { email: toEmail } }),
    prisma.business.updateMany({ where: { ownerEmail: fromEmail }, data: { ownerEmail: toEmail } }),
    prisma.membership.updateMany({ where: { email: fromEmail }, data: { email: toEmail } }),
    prisma.passwordLogin.updateMany({ where: { email: fromEmail }, data: { email: toEmail, verifiedAt: now } }),
    prisma.twoStep.updateMany({ where: { email: fromEmail }, data: { email: toEmail } }),
    prisma.lead.updateMany({ where: { assigneeEmail: fromEmail }, data: { assigneeEmail: toEmail } }),
    prisma.job.updateMany({ where: { assigneeEmail: fromEmail }, data: { assigneeEmail: toEmail } }),
    prisma.pushSubscription.updateMany({ where: { email: fromEmail }, data: { email: toEmail } }),
    prisma.signInEvent.updateMany({ where: { email: fromEmail }, data: { email: toEmail } }),
    prisma.loginToken.deleteMany({ where: { email: fromEmail, usedAt: null } }),
    prisma.emailChange.updateMany({ where: { fromEmail, usedAt: null }, data: { expiresAt: now } }),
  ]);
  await revokeAllSessions(fromEmail, now);

  const summary = `Sign-in email changed from ${fromEmail} to ${toEmail}`;
  for (const shop of owned) {
    await recordAudit({ businessId: shop.id, entityType: "shop", entityId: shop.id, action: "account.email_changed", actor: "owner", actorEmail: toEmail, summary });
  }
  for (const m of memberships) {
    await recordAudit({ businessId: m.businessId, entityType: "shop", entityId: m.businessId, action: "account.email_changed", actor: "teammate", actorEmail: toEmail, summary });
  }

  // Stripe receipts and billing emails follow the owner to the new address.
  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    const { getStripe } = await import("@/lib/stripe");
    for (const shop of owned) {
      if (!shop.stripeCustomerId) continue;
      await getStripe()
        .customers.update(shop.stripeCustomerId, { email: toEmail })
        .catch((error: unknown) =>
          logWarn("email_change.stripe_failed", { businessId: shop.id, error: error instanceof Error ? error.message : String(error) }),
        );
    }
  }

  await sendSecurityNotice(fromEmail, "email_changed", { now, detail: `New address: ${toEmail}` });
  if (isEmailConfigured()) {
    await sendOwnerEmail({
      to: toEmail,
      subject: `${company.productName}: this is now your sign-in email`,
      text: [`Your ${company.productName} sign-in is now ${toEmail}. Sign in here: ${getAppUrl()}/signin`, "", `Questions: ${company.supportEmail}`, "", "— Orvius"].join("\n"),
    }).catch((error: unknown) => logWarn("email_change.welcome_failed", { error: error instanceof Error ? error.message : String(error) }));
  }
  return { ok: true, fromEmail, toEmail, shops: owned.length + memberships.length };
}
