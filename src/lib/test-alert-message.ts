import type { NotifyOwnerResult } from "@/lib/notification-queue";

/** What the owner is told after a test alert: which channels the providers accepted, and what to fix. */
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
  if (smsSent && emailSent) return { ok: true, partial: false, message: `Texted ${to.phone} and emailed ${to.email}.` };
  if (smsSent) return { ok: true, partial: false, message: `Texted ${to.phone}.` };
  if (emailSent) {
    return textProblem
      ? { ok: true, partial: true, message: `Emailed ${to.email}, but ${textProblem}.` }
      : { ok: true, partial: false, message: `Emailed ${to.email}. Add your mobile to get alerts by text.` };
  }
  return {
    ok: false,
    partial: false,
    message: textProblem
      ? `Nothing was delivered: ${textProblem}.`
      : "Nothing was delivered. Check your mobile number and email, then try again.",
  };
}
