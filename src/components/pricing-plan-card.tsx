import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { ShellPanel } from "@/components/shell-primitives";
import type { PaidPlanId, PricingPlan } from "@/lib/pricing-plans";

type PricingPlanCardProps = {
  plan: PricingPlan;
  email?: string;
  layout?: "marketing" | "dashboard";
  recommended?: boolean;
};

export function PricingPlanCard({
  plan,
  email = "",
  layout = "marketing",
  recommended = false,
}: PricingPlanCardProps) {
  const isPilot = plan.id === "pilot";
  const featured = plan.featured ?? false;
  const highlight = recommended || featured;

  const priceBlock = isPilot ? (
    <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
      {plan.period}
    </p>
  ) : (
    <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
      ${plan.price}
      <span className="text-base font-medium text-ash"> / {plan.period}</span>
    </p>
  );

  const detail = plan.limit ?? plan.tagline;

  const highlights = (
    <ul className={layout === "dashboard" ? "account-plan-list font-sans" : "tier1-plan-list font-sans"}>
      {plan.highlights.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );

  const action = isPilot ? (
    <Link
      href={plan.href ?? "/pilot"}
      className={
        layout === "dashboard"
          ? "btn btn-secondary text-sm"
          : `inst-btn ${featured ? "inst-btn-primary" : "inst-btn-ghost"}`
      }
    >
      {plan.cta}
    </Link>
  ) : (
    <CheckoutButton
      planId={plan.id as PaidPlanId}
      label={`Subscribe · $${plan.price}/mo`}
      variant={featured ? "primary" : "secondary"}
      email={email}
    />
  );

  if (layout === "dashboard") {
    return (
      <ShellPanel title={plan.name}>
        {priceBlock}
        <p className="mt-2 font-sans text-sm text-ash">{detail}</p>
        {highlights}
        <div className="mt-5">{action}</div>
      </ShellPanel>
    );
  }

  return (
    <article
      className={`tier1-plan ${highlight ? "tier1-plan-featured" : ""} ${recommended ? "tier1-plan-recommended" : ""}`}
    >
      {recommended ? (
        <p className="tier1-plan-badge type-caption">Recommended</p>
      ) : null}
      <p className="tier1-eyebrow type-eyebrow">{plan.name}</p>
      {isPilot ? (
        <p className="tier1-plan-price font-sans">{plan.period}</p>
      ) : (
        <p className="tier1-plan-price font-sans">
          ${plan.price}
          <span className="tier1-plan-period">/mo</span>
        </p>
      )}
      <p className="tier1-section-lead font-sans">{plan.tagline}</p>
      {!isPilot && plan.idealFor ? (
        <p className="tier1-plan-ideal font-sans">Built for: {plan.idealFor}</p>
      ) : null}
      {highlights}
      {action}
    </article>
  );
}
