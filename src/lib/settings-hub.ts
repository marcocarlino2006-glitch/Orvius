/**
 * Settings hub — one resume point for the shop (and founder paste path).
 * Multi-b pattern: progress + single next action + jump links, not a form dump.
 */

export type SettingsHubItemId =
  | "capture"
  | "alerts"
  | "baseline"
  | "billing"
  | "data"
  | "money"
  | "resend"
  | "cert";

export type SettingsHubItem = {
  id: SettingsHubItemId;
  label: string;
  detail: string;
  href: string;
  ok: boolean;
  /** Founder-only rows stay off the owner hub. */
  founderOnly?: boolean;
};

export type SettingsHubNext = {
  id: SettingsHubItemId;
  title: string;
  body: string;
  cta: string;
  href: string;
};

export type SettingsHubInput = {
  founder?: boolean;
  lineVerified?: boolean;
  overflowConfirmed?: boolean;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  avgTicketCents?: number | null;
  emailConfigured?: boolean;
  ownerSmsOptedOut?: boolean;
  billingConfigured?: boolean;
  billingFullyReady?: boolean;
  certDone?: number;
  certTotal?: number;
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
  const alertsOk =
    hasPhone(input.ownerPhone) && !input.ownerSmsOptedOut;
  const baselineOk = Boolean(input.avgTicketCents && input.avgTicketCents > 0);
  const billingOk = Boolean(input.billingConfigured);
  const moneyOk = Boolean(input.billingFullyReady ?? input.billingConfigured);
  const resendOk = Boolean(input.emailConfigured);
  const certTotal = input.certTotal ?? 5;
  const certDone = input.certDone ?? 0;
  const certOk = certDone >= certTotal;

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
    {
      id: "money",
      label: "Money setup",
      detail: moneyOk
        ? "Stripe keys + webhook green"
        : "Secret, prices, webhook on Vercel",
      href: "/dashboard/billing",
      ok: moneyOk,
      founderOnly: true,
    },
    {
      id: "resend",
      label: "Email backup",
      detail: resendOk
        ? "Resend live for SMS failover"
        : "Paste RESEND_API_KEY on Vercel",
      href: "#email-failover",
      ok: resendOk,
      founderOnly: true,
    },
    {
      id: "cert",
      label: "Phone certification",
      detail: `${certDone}/${certTotal} founder call drills`,
      href: "#founder-cert",
      ok: certOk,
      founderOnly: true,
    },
  ];

  const visible = items.filter(
    (item) => !item.founderOnly || input.founder,
  );
  const actionable = visible.filter((item) => item.id !== "data");
  const doneCount = actionable.filter((item) => item.ok).length;
  const totalCount = actionable.length;

  let next: SettingsHubNext | null = null;
  if (!captureOk) {
    next = {
      id: "capture",
      title: "Finish call capture",
      body: "Forward missed calls to Orvius — or publish the Orvius number — then prove one real call.",
      cta: "Open call capture",
      href: "#overflow-forward",
    };
  } else if (!alertsOk) {
    next = {
      id: "alerts",
      title: input.ownerSmsOptedOut
        ? "Turn owner SMS back on"
        : "Add your owner mobile",
      body: input.ownerSmsOptedOut
        ? "Text START from your cell to the shop alert number, then send a test alert."
        : "Night leads text this number. It must be your cell — not the shop line.",
      cta: "Open owner alerts",
      href: "#owner-alerts",
    };
  } else if (input.founder && !moneyOk) {
    next = {
      id: "money",
      title: "Finish money setup",
      body: "Billing shows the green checklist — secret key, prices, webhook. Then one test Pay with card.",
      cta: "Open money setup",
      href: "/dashboard/billing",
    };
  } else if (input.founder && !resendOk) {
    next = {
      id: "resend",
      title: "Turn on email backup",
      body: "Paste RESEND_API_KEY and RESEND_FROM on Vercel so SMS→email failover works.",
      cta: "Open email backup",
      href: "#email-failover",
    };
  } else if (!baselineOk) {
    next = {
      id: "baseline",
      title: "Set average ticket",
      body: "One number unlocks estimated booked value on Command — not collected revenue.",
      cta: "Open baseline",
      href: "#economics-baseline",
    };
  } else if (input.founder && !certOk) {
    next = {
      id: "cert",
      title: "Finish phone certification",
      body: "Five real call drills before you trust the line overnight.",
      cta: "Open certification",
      href: "#founder-cert",
    };
  } else if (!billingOk) {
    next = {
      id: "billing",
      title: "Open billing",
      body: "Plan, Pay with card, and payouts live on Billing — one tap from here.",
      cta: "Open billing",
      href: "/dashboard/billing",
    };
  }

  return { items: visible, next, doneCount, totalCount };
}
