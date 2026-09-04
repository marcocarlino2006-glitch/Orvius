"use client";

import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type ConfirmState =
  | { status: "loading" }
  | { status: "ok"; plan: string | null; shop: string | null }
  | { status: "pending"; detail: string }
  | { status: "error"; detail: string };

function BillingSuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState<ConfirmState>({ status: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setState({
        status: "pending",
        detail: "No session id — open the dashboard; webhook may still activate billing.",
      });
      return;
    }

    let cancelled = false;
    async function confirm() {
      try {
        const res = await fetch(
          `/api/billing/confirm?session_id=${encodeURIComponent(sessionId!)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setState({
            status: "pending",
            detail:
              data.error ??
              "Payment received — activation may take a moment if the webhook is catching up.",
          });
          return;
        }
        setState({
          status: "ok",
          plan: data.business?.billingPlan ?? null,
          shop: data.business?.name ?? null,
        });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            detail: "Could not confirm yet. Your receipt email is the source of truth.",
          });
        }
      }
    }
    void confirm();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const title =
    state.status === "ok"
      ? "Subscription active"
      : state.status === "loading"
        ? "Confirming subscription…"
        : "Payment received";

  const description =
    state.status === "ok"
      ? `${state.shop ? `${state.shop} · ` : ""}${state.plan ? state.plan.toUpperCase() : "Orvius"} is live. Your line stays on.`
      : state.status === "loading"
        ? "Syncing Stripe with your shop…"
        : state.status === "pending" || state.status === "error"
          ? state.detail
          : `Thank you. ${company.legalName} is activating billing.`;

  return (
    <MarketingShell cta={false}>
      <section className="marketing-hero">
        <div className="editorial-wrap max-w-3xl">
          <ShellPageIntro label="Billing" title={title} description={description} />
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap max-w-3xl">
          <div className="panel-chalk p-6 md:p-8">
            <ol className="list-decimal space-y-3 pl-5 font-sans text-sm leading-relaxed text-ash">
              <li>
                Check your email for the Stripe receipt from {company.legalName}.
              </li>
              <li>
                Confirm leads still flow in{" "}
                <Link href="/dashboard" className="home-platform-link">
                  your dashboard
                </Link>
                .
              </li>
              <li>
                Need help? Email{" "}
                <a
                  href={`mailto:${company.contactEmail}`}
                  className="home-platform-link"
                >
                  {company.contactEmail}
                </a>
                .
              </li>
            </ol>

            <div className="mt-8 marketing-actions">
              <Link href="/dashboard" className="tier-btn tier-btn-primary">
                Open dashboard
              </Link>
              <Link href="/dashboard/billing" className="home-platform-link">
                Billing details →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <MarketingShell cta={false}>
          <section className="marketing-hero">
            <div className="editorial-wrap max-w-3xl">
              <ShellPageIntro
                label="Billing"
                title="Confirming subscription…"
                description="Syncing Stripe with your shop…"
              />
            </div>
          </section>
        </MarketingShell>
      }
    >
      <BillingSuccessInner />
    </Suspense>
  );
}
