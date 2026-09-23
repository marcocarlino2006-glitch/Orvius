/**
 * Shared dashboard fetch recovery — map status → cause / impact / recover.
 * Never leave the owner with a blank “Failed to load” and no next step.
 */

export type DashboardLoadFailure = {
  status: number | null;
  title: string;
  cause: string;
  impact: string;
  recovery: string;
  href?: string;
  hrefLabel?: string;
};

export function describeDashboardFailure(
  surface: string,
  status: number | null,
  rawMessage?: string | null,
): DashboardLoadFailure {
  if (status === 401) {
    return {
      status,
      title: `${surface} needs you signed in`,
      cause: "Your session expired or is missing.",
      impact: `You cannot see ${surface.toLowerCase()} until you sign in again.`,
      recovery: "Sign in, then return to this page.",
      href: "/signin",
      hrefLabel: "Sign in",
    };
  }

  if (status === 402 || status === 403) {
    return {
      status,
      title: `${surface} is locked on this plan`,
      cause:
        status === 402
          ? "Billing is past due or the pilot window ended."
          : "This module is not on your current plan.",
      impact: `Actions on ${surface.toLowerCase()} will not run until access is restored.`,
      recovery:
        status === 402
          ? "Open Billing and pay to continue."
          : "Upgrade your plan, or work from Inbox and Calls on Line.",
      href: status === 402 ? "/dashboard/billing" : "/dashboard/pricing",
      hrefLabel: status === 402 ? "Open Billing" : "View plans",
    };
  }

  if (status === 404) {
    return {
      status,
      title: `${surface} has no shop yet`,
      cause: "No active shop is linked to this account.",
      impact: "There is nothing to load until setup finishes.",
      recovery: "Finish onboarding to create your line and shop record.",
      href: "/dashboard/onboarding",
      hrefLabel: "Continue setup",
    };
  }

  return {
    status,
    title: `${surface} could not load`,
    cause: rawMessage?.trim() || "The server did not return this list.",
    impact: `${surface} may be incomplete until this recovers — your shop line still answers calls.`,
    recovery: "Retry now. If it keeps failing, open Command and check Settings.",
    href: "/dashboard",
    hrefLabel: "Open Command",
  };
}

export async function readDashboardError(
  surface: string,
  res: Response,
): Promise<DashboardLoadFailure> {
  let raw: string | null = null;
  try {
    const data = (await res.json()) as { error?: string };
    raw = data.error ?? null;
  } catch {
    raw = null;
  }
  return describeDashboardFailure(surface, res.status, raw);
}
