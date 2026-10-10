import { CredentialsSignin } from "next-auth";

import { sharedRateLimit } from "@/lib/rate-limit";
import { twoStepEnabled, verifyTwoStepCode } from "@/lib/two-step";

/* Codes travel in the sign-in URL, so they say only what the form needs to show next. */
export class TwoStepRequired extends CredentialsSignin {
  code = "two_step_required";
}
export class TwoStepInvalid extends CredentialsSignin {
  code = "two_step_invalid";
}

/** When the address has two-step on, a password or email link alone is not enough. */
export async function requireTwoStepCode(email: string, code: unknown) {
  if (!(await twoStepEnabled(email))) return;
  const typed = typeof code === "string" ? code.trim() : "";
  if (!typed) throw new TwoStepRequired();
  const limit = await sharedRateLimit({ key: `two-step:${email.toLowerCase()}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.ok || !(await verifyTwoStepCode(email, typed)).ok) throw new TwoStepInvalid();
}
