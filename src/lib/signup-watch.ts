import { pagePlatform } from "@/lib/platform-pager";
import { getPublicLaunchReadiness, missingLaunchRequirements } from "@/lib/public-launch-readiness";

/*
  Signup closes when any one launch requirement drops, and nothing about the
  site looks broken: the pay button just becomes "book a call". So production
  checks every sweep and pages the founder with which requirement is off.
*/
export async function pageIfSignupClosed(now = new Date(), readiness = getPublicLaunchReadiness()) {
  if (process.env.VERCEL_ENV !== "production") return { checked: false as const };
  if (readiness.ready) return { checked: true as const, open: true };
  const missing = missingLaunchRequirements(readiness.requirements);
  const page = await pagePlatform("signup_closed", { summary: `Off: ${missing.join(", ")}.`, missing }, now);
  return { checked: true as const, open: false, missing, paged: page.paged };
}
