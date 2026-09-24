/**
 * Owner operate next-action — one truth for Command.
 * Founder multi-b gates stay on /admin/daily. This is the shop owner at 6am.
 *
 * Cursor tunnel rule: never leave the owner without a next move.
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

const COVERED: ShopOperateNext = {
  id: "covered",
  title: "You’re covered",
  detail:
    "Nothing needs you. The line is watching. Ask Orvius if you’re unsure.",
  href: "/dashboard/ask",
  cta: "Ask Orvius",
  tone: "ritual",
};

/** Cursor tunnel — owner asks what to do; same next gate as Command. */
export function isNextActionQuestion(question: string): boolean {
  const q = question.toLowerCase().trim();
  if (!q) return false;
  return (
    q.includes("what should i") ||
    q.includes("what do i") ||
    q.includes("what next") ||
    q.includes("what's next") ||
    q.includes("whats next") ||
    q.includes("do now") ||
    q.includes("need me") ||
    q.includes("next on the shop") ||
    q === "help" ||
    q === "what now" ||
    q.includes("what needs")
  );
}

/**
 * Resolve the single next owner action. Order is load-bearing:
 * coverage faults → setup → critical board → weekly proof → covered.
 * Always returns a move for Ask. Command UI may hide board/covered banners
 * when the board or pulse already owns that state.
 */
export function resolveShopOperateNext(
  input: ShopOperateInput,
): ShopOperateNext {
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
      href: "/dashboard#work-queue",
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
      href: "/dashboard#work-queue",
      cta: "Open the board",
      tone: "attention",
    };
  }

  if (input.economicsReady && input.proofStale) {
    return {
      id: "weekly-proof",
      title: "Copy this week’s results",
      detail: "Copy booked jobs and estimated value for your notes.",
      href: "/dashboard",
      cta: "Copy results",
      tone: "ritual",
    };
  }

  return COVERED;
}

/** Command already owns this state — painting a second CTA is ceremony. */
export function shopOperateBannerVisible(next: ShopOperateNext): boolean {
  if (next.id === "covered") return false;
  if (next.id === "board" || next.id === "board-critical") return false;
  return true;
}
