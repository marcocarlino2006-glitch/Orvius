/**
 * Settings hub — owner product surface only.
 * Founder ops (Resend, phone cert, Manus) live on /admin/ops — not here.
 */

export type SettingsHubItemId =
  | "capture"
  | "alerts"
  | "baseline"
  | "billing"
  | "data"
  | "profile";

export type SettingsHubItem = {
  id: SettingsHubItemId;
  label: string;
  detail: string;
  href: string;
  ok: boolean;
};

export type SettingsHubNext = {
  id: SettingsHubItemId;
  title: string;
  body: string;
  cta: string;
  href: string;
};

export type SettingsHubInput = {
  lineVerified?: boolean;
  overflowConfirmed?: boolean;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  shopName?: string | null;
  avgTicketCents?: number | null;
  ownerSmsOptedOut?: boolean;
  billingConfigured?: boolean;
};

function hasPhone(value: string | null | undefined): boolean {
  return Boolean(value && value.replace(/\D/g, "").length >= 10);
}

export function buildSettingsHub(input: SettingsHubInput): {
  items: SettingsHubItem[];
  next: SettingsHubNext | null;
  doneCount: number;
  totalCount: number;
} {
  const captureOk = Boolean(input.lineVerified || input.overflowConfirmed);
  const alertsOk = hasPhone(input.ownerPhone) && !input.ownerSmsOptedOut;
  const profileOk =
    Boolean(input.shopName?.trim()) &&
    hasPhone(input.ownerPhone) &&
    Boolean(input.ownerEmail?.trim());
  const baselineOk = Boolean(input.avgTicketCents && input.avgTicketCents > 0);
  const billingOk = Boolean(input.billingConfigured);

  const items: SettingsHubItem[] = [
    {
      id: "capture",
      label: "Call capture",
      detail: captureOk
        ? "Line path confirmed"
        : "Forward or publish your shop number",
      href: "#overflow-forward",
      ok: captureOk,
    },
    {
      id: "alerts",
      label: "Owner alerts",
      detail: input.ownerSmsOptedOut
        ? "SMS opted out — text START"
        : alertsOk
          ? "Owner mobile ready"
          : "Add the cell that gets night leads",
      href: "#owner-alerts",
      ok: alertsOk,
    },
    {
      id: "profile",
      label: "Shop profile",
      detail: profileOk
        ? "Shop name and contact set"
        : "Name, mobile, and email on Profile",
      href: "/dashboard/profile",
      ok: profileOk,
    },
    {
      id: "baseline",
      label: "Opening line + baseline",
      detail: baselineOk
        ? "Ticket baseline set"
        : "Average ticket unlocks Command value",
      href: "#economics-baseline",
      ok: baselineOk,
    },
    {
      id: "billing",
      label: "Plan & billing",
      detail: billingOk
        ? "Checkout can open"
        : "Pay and payouts live here",
      href: "/dashboard/billing",
      ok: billingOk,
    },
    {
      id: "data",
      label: "Your data",
      detail: "Export customers, jobs, and money",
      href: "#shop-data",
      ok: true,
    },
  ];

  const actionable = items.filter((item) => item.id !== "data");
  const doneCount = actionable.filter((item) => item.ok).length;
  const totalCount = actionable.length;

  let next: SettingsHubNext | null = null;
  if (!captureOk) {
    next = {
      id: "capture",
      title: "Catch missed calls",
      body: "Forward your shop number — or publish the Orvius line. One real call proves it.",
      cta: "Set call capture",
      href: "#overflow-forward",
    };
  } else if (!alertsOk) {
    next = {
      id: "alerts",
      title: input.ownerSmsOptedOut
        ? "Turn owner texts back on"
        : "Add your mobile",
      body: input.ownerSmsOptedOut
        ? "Text START from your cell, then send a test alert."
        : "Job alerts go here — your cell, not the shop line.",
      cta: "Add mobile",
      href: "#owner-alerts",
    };
  } else if (!profileOk) {
    next = {
      id: "profile",
      title: "Complete shop profile",
      body: "Shop name, owner mobile, and email — identity, not ops.",
      cta: "Open Profile",
      href: "/dashboard/profile",
    };
  } else if (!baselineOk) {
    next = {
      id: "baseline",
      title: "Set average ticket",
      body: "One number unlocks estimated booked value on Command.",
      cta: "Set ticket",
      href: "#economics-baseline",
    };
  } else if (!billingOk) {
    next = {
      id: "billing",
      title: "Open billing",
      body: "Plan, Pay with card, and payouts — one tap.",
      cta: "Open Billing",
      href: "/dashboard/billing",
    };
  }

  return { items, next, doneCount, totalCount };
}
