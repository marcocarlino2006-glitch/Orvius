import type { NotifyOwnerResult } from "@/lib/notification-queue";

/**
 * What the owner is told after a test alert: which channels the providers
 * accepted, and what to fix. Accepted is not delivered (a carrier or inbox can
 * still drop it), so success says sent and asks the owner to look.
 */
export function describeTestAlert(
  result: NotifyOwnerResult,
  to: { phone: string | null; email: string | null },
): { ok: boolean; partial: boolean; message: string } {
  const sms = result.sms?.status;
  const email = result.email?.status;
  if (result.duplicate || sms === "duplicate" || email === "duplicate") {
    return { ok: true, partial: false, message: "A test alert already went out this minute. Check your phone and inbox." };
  }
  const smsSent = sms === "sent";
  const emailSent = email === "sent";
  const textProblem =
    to.phone && sms === "failed"
      ? `the text to ${to.phone} didn't go through${result.sms?.error ? ` (${result.sms.error})` : ""}. Check your mobile number`
      : to.phone && (sms === "skipped" || sms === undefined)
        ? "text alerts are off right now"
        : null;
  const look = "If it hasn't arrived in a minute, check the number and your spam folder.";
  if (smsSent && emailSent) return { ok: true, partial: false, message: `Sent a text to ${to.phone} and an email to ${to.email}. ${look}` };
  if (smsSent) return { ok: true, partial: false, message: `Sent a text to ${to.phone}. If it hasn't arrived in a minute, check the number.` };
  if (emailSent) {
    return textProblem
      ? { ok: true, partial: true, message: `Sent an email to ${to.email}, but ${textProblem}.` }
      : { ok: true, partial: false, message: `Sent an email to ${to.email} (check spam if it isn't there). Add your mobile to get alerts by text.` };
  }
  return {
    ok: false,
    partial: false,
    message: textProblem
      ? `Nothing went out: ${textProblem}.`
      : "Nothing went out. Check your mobile number and email, then try again.",
  };
}
