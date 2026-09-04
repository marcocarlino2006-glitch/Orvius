"use client";

import Link from "next/link";

export type LaunchGate = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  href: string;
  cta: string;
};

type LaunchGatesStripProps = {
  gates: LaunchGate[];
  title?: string;
};

/**
 * Multi-b cockpit — every open gate is a hard CTA, not a notebook note.
 */
export function LaunchGatesStrip({
  gates,
  title = "Launch gates",
}: LaunchGatesStripProps) {
  const open = gates.filter((g) => !g.ok);
  const done = gates.length - open.length;

  return (
    <section className="launch-gates font-sans" aria-label={title}>
      <div className="launch-gates-head">
        <p className="launch-gates-kicker type-eyebrow">{title}</p>
        <p className="launch-gates-score">
          {done}/{gates.length} closed
          {open.length > 0 ? ` · ${open.length} blocking multi-b` : " · clear"}
        </p>
      </div>
      <ul className="launch-gates-list">
        {gates.map((gate) => (
          <li
            key={gate.id}
            className={`launch-gates-item ${gate.ok ? "launch-gates-item--ok" : "launch-gates-item--open"}`}
          >
            <div className="launch-gates-copy">
              <p className="launch-gates-label">
                <span aria-hidden>{gate.ok ? "✓" : "!"}</span> {gate.label}
              </p>
              <p className="launch-gates-detail">{gate.detail}</p>
            </div>
            {!gate.ok ? (
              <Link href={gate.href} className="btn btn-void text-sm">
                {gate.cta}
              </Link>
            ) : (
              <span className="launch-gates-done">Done</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function buildShopLaunchGates(input: {
  certDone: number;
  certTotal: number;
  baselineReady: boolean;
  proofFresh: boolean;
  lastProofLabel: string;
  checkoutReady: boolean;
  entitled: boolean;
  billingStatus: string;
  wedgeReady: boolean;
  wedgeScore?: string;
}): LaunchGate[] {
  return [
    {
      id: "cert",
      label: "Founder phone certification",
      ok: input.certDone >= input.certTotal,
      detail: `${input.certDone}/${input.certTotal} scenarios from your cell`,
      href: "/dashboard/settings#founder-cert",
      cta: "Certify",
    },
    {
      id: "baseline",
      label: "Baseline economics",
      ok: input.baselineReady,
      detail: input.baselineReady
        ? "Avg ticket + before-Orvius baselines set"
        : "Set avg ticket and weekly baselines",
      href: "/dashboard/settings#economics-baseline",
      cta: "Set baseline",
    },
    {
      id: "proof",
      label: "Weekly proof ritual",
      ok: input.proofFresh,
      detail: input.lastProofLabel,
      href: "/dashboard",
      cta: "Copy proof",
    },
    {
      id: "billing",
      label: "Collect money (Stripe)",
      ok: input.checkoutReady && (input.entitled || input.billingStatus === "active"),
      detail: input.checkoutReady
        ? input.billingStatus === "active"
          ? "Subscription active"
          : "Checkout ready — convert pilot"
        : "Stripe not configured — founder unblock",
      href: "/dashboard/billing",
      cta: input.checkoutReady ? "Subscribe" : "Unblock Stripe",
    },
    {
      id: "wedge",
      label: "Wedge readiness",
      ok: input.wedgeReady,
      detail: input.wedgeScore ?? (input.wedgeReady ? "Ready" : "Finish go-live checklist"),
      href: "/dashboard/settings",
      cta: "Fix wedge",
    },
  ];
}
