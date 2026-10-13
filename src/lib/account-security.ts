import { company } from "@/lib/company";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { normalizeEmail } from "@/lib/magic-link";
import { prisma } from "@/lib/prisma";

/** Ends every session for this email, on every device, including the one asking. */
export async function revokeAllSessions(rawEmail: string, now = new Date()): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) return;
  await prisma.sessionRevocation.upsert({
    where: { email },
    create: { email, revokedAt: now },
    update: { revokedAt: now },
  });
}

/** A session from before it carried a sign-in time counts as started at zero, so a revocation covers it. */
export async function sessionRevoked(rawEmail: string, signedInAt: number | undefined): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const row = await prisma.sessionRevocation.findUnique({ where: { email }, select: { revokedAt: true } });
  return Boolean(row && (signedInAt ?? 0) < row.revokedAt.getTime());
}

export type SecurityChange =
  | "password_set"
  | "password_changed"
  | "two_step_on"
  | "two_step_off"
  | "recovery_codes"
  | "signed_out_everywhere"
  | "new_sign_in"
  | "email_change_requested"
  | "email_changed";

const NOTICE: Record<SecurityChange, { subject: string; text: string }> = {
  password_set: { subject: "Password added", text: "A password was added to your Orvius sign-in." },
  password_changed: { subject: "Password changed", text: "Your Orvius password was changed." },
  two_step_on: { subject: "Two-step sign-in on", text: "Two-step sign-in was turned on for your Orvius account." },
  two_step_off: { subject: "Two-step sign-in off", text: "Two-step sign-in was turned off for your Orvius account." },
  recovery_codes: {
    subject: "New recovery codes",
    text: "New two-step recovery codes were made for your Orvius account. The old ones no longer work.",
  },
  signed_out_everywhere: { subject: "Signed out everywhere", text: "Your Orvius account was signed out on every device." },
  new_sign_in: { subject: "New sign-in", text: "Your Orvius account was signed in to from a device it hasn't seen before." },
  email_change_requested: {
    subject: "Sign-in email change requested",
    text: "Someone signed in to your Orvius account asked to move it to a new email address. Nothing changes unless the link sent to that address is opened within an hour.",
  },
  email_changed: {
    subject: "Sign-in email changed",
    text: "Your Orvius sign-in moved to a new email address. This address no longer signs in, and every device signed in with it was signed out.",
  },
};

/*
  Every change to how someone signs in is told to the address itself, so a
  person who took over a session can't quietly lock the owner out. A failed
  email never blocks the change; it is logged.
*/
export async function sendSecurityNotice(
  rawEmail: string,
  change: SecurityChange,
  options: { now?: Date; detail?: string } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const email = normalizeEmail(rawEmail);
  if (!email || !isEmailConfigured()) return;
  const when = now.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
  const notYou =
    change === "signed_out_everywhere"
      ? `If this wasn't you, sign in again and change your password: ${getAppUrl()}/signin`
      : change === "email_changed"
        ? `If this wasn't you, email ${company.supportEmail} right away from this address and we'll help you get the account back.`
        : `If this wasn't you, sign in, choose "Sign out of all devices" and change your password: ${getAppUrl()}/dashboard?settings=account`;
  try {
    await sendOwnerEmail({
      to: email,
      subject: `${company.productName} security: ${NOTICE[change].subject}`,
      text: [NOTICE[change].text, ...(options.detail ? [options.detail] : []), `When: ${when} UTC`, "", notYou, "", `Questions: ${company.supportEmail}`, "", "— Orvius"].join("\n"),
    });
  } catch (error) {
    logWarn("account_security.notice_failed", { change, error: error instanceof Error ? error.message : String(error) });
  }
}
