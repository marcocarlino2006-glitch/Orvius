import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { ShellPanel } from "@/components/shell-primitives";
import {
  getPlanPrice,
  type BillingInterval,
  type PaidPlanId,
  type PricingPlan,
} from "@/lib/pricing-plans";

type PricingPlanCardProps = {
  plan: PricingPlan;
  email?: string;
  layout?: "marketing" | "dashboard";
  recommended?: boolean;
  interval?: BillingInterval;
};

export function PricingPlanCard({
  plan,
  email = "",
  layout = "marketing",
  recommended = false,
  interval = "month",
}: PricingPlanCardProps) {
  const isPilot = plan.id === "pilot";
  const isMulti = plan.contactSales ?? plan.id === "multi";
  const featured = plan.featured ?? false;
  const highlight = recommended || featured;
  const monthlyPrice = isPilot || isMulti ? null : getPlanPrice(plan, "month");
  const displayPrice =
    isPilot || isMulti ? null : getPlanPrice(plan, interval);

  const priceBlock = isPilot ? (
    <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
      {plan.period}
    </p>
  ) : isMulti ? (
    <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
      Custom
    </p>
  ) : (
    <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
      ${displayPrice}
      <span className="text-base font-medium text-ash"> / mo</span>
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

  const action = isPilot || isMulti ? (
    <Link
      href={plan.href ?? (isMulti ? "mailto:hello@orvius.im" : "/pilot")}
      className={
        layout === "dashboard"
          ? "btn btn-secondary text-sm"
          : `inst-btn ${featured || recommended ? "inst-btn-primary" : "inst-btn-ghost"}`
      }
    >
      {plan.cta}
    </Link>
  ) : (
    <CheckoutButton
      planId={plan.id as PaidPlanId}
      interval={interval}
      label={
        interval === "year"
          ? `Subscribe · $${displayPrice}/mo billed annually`
          : `Subscribe · $${displayPrice}/mo`
      }
      variant={featured || recommended ? "primary" : "secondary"}
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
      ) : featured ? (
        <p className="tier1-plan-badge type-caption">Most popular</p>
      ) : null}
      <p className="tier1-eyebrow type-eyebrow">{plan.name}</p>
      {isPilot ? (
        <p className="tier1-plan-price font-sans">{plan.period}</p>
      ) : isMulti ? (
        <p className="tier1-plan-price font-sans">Custom</p>
      ) : (
        <p className="tier1-plan-price font-sans">
          ${displayPrice}
          <span className="tier1-plan-period">/mo</span>
        </p>
      )}
      {!isPilot && !isMulti && interval === "year" && monthlyPrice ? (
        <p className="tier1-plan-annual-note font-sans">
          ${monthlyPrice}/mo if billed monthly · save ~17% annually
        </p>
      ) : null}
      <p className="tier1-section-lead font-sans">{plan.tagline}</p>
      {!isPilot && !isMulti && plan.idealFor ? (
        <p className="tier1-plan-ideal font-sans">Built for: {plan.idealFor}</p>
      ) : null}
      {highlights}
      {action}
    </article>
  );
}
