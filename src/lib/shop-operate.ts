/**
 * Owner operate next-action — one truth for Command.
 * Founder multi-b gates stay on /admin/daily. This is the shop owner at 6am.
 */

export type ShopOperateTone = "critical" | "attention" | "ritual";

export type ShopOperateNext = {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: ShopOperateTone;
};

export type ShopOperateInput = {
  setupReady: boolean;
  setupNext: "line" | "owner_phone" | "capture" | "verify" | "done";
  setupHref: string;
  failedAlerts: number;
  stuckAlerts: number;
  criticalAttention: number;
  attentionCount: number;
  proofStale: boolean;
  economicsReady: boolean;
};

const SETUP_COPY: Record<
  Exclude<ShopOperateInput["setupNext"], "done">,
  { title: string; detail: string; cta: string }
> = {
  line: {
    title: "Get your shop line",
    detail: "Orvius needs a dedicated number before night calls can land here.",
    cta: "Set up line",
  },
  owner_phone: {
    title: "Add your mobile",
    detail: "Alerts have nowhere to go until your cell is on the shop.",
    cta: "Add mobile",
  },
  verify: {
    title: "Prove your line",
    detail: "Place one test call so the night shift is verified end-to-end.",
    cta: "Prove it",
  },
  capture: {
    title: "Confirm call capture",
    detail: "Forward overflow / after-hours — or publish the Orvius number.",
    cta: "Confirm capture",
  },
};

/**
 * Resolve the single next owner action. Order is load-bearing:
 * coverage faults → setup → critical board → weekly proof ritual.
 */
export function resolveShopOperateNext(
  input: ShopOperateInput,
): ShopOperateNext | null {
  if (input.failedAlerts > 0 || input.stuckAlerts > 0) {
    const n = input.failedAlerts || input.stuckAlerts;
    return {
      id: "alerts",
      title: "Owner alerts need a fix",
      detail:
        input.failedAlerts > 0
          ? `${input.failedAlerts} alert${input.failedAlerts === 1 ? "" : "s"} failed in the last day.`
          : `${n} alert${n === 1 ? "" : "s"} stuck in the send queue.`,
      href: "/dashboard/settings",
      cta: "Send test alert",
      tone: "critical",
    };
  }

  if (!input.setupReady && input.setupNext !== "done") {
    const copy = SETUP_COPY[input.setupNext];
    return {
      id: `setup:${input.setupNext}`,
      title: copy.title,
      detail: copy.detail,
      href: input.setupHref,
      cta: copy.cta,
      tone: "attention",
    };
  }

  if (input.criticalAttention > 0) {
    return {
      id: "board-critical",
      title: "Critical work on the board",
      detail: `${input.criticalAttention} critical item${
        input.criticalAttention === 1 ? "" : "s"
      } waiting — book, assign, or call back.`,
      href: "/dashboard#attention-board",
      cta: "Open the board",
      tone: "critical",
    };
  }

  if (input.attentionCount > 0) {
    return {
      id: "board",
      title: "Work waiting on the board",
      detail: `${input.attentionCount} item${
        input.attentionCount === 1 ? "" : "s"
      } need you before the shift moves on.`,
      href: "/dashboard#attention-board",
      cta: "Open the board",
      tone: "attention",
    };
  }

  if (input.economicsReady && input.proofStale) {
    return {
      id: "weekly-proof",
      title: "Stamp this week’s proof",
      detail: "Copy the weekly proof so recovered demand stays an honest artifact.",
      href: "/dashboard#shop-economics",
      cta: "Copy proof",
      tone: "ritual",
    };
  }

  return null;
}
