import type { Metadata } from "next";
import Link from "next/link";
import { InterestListForm } from "@/components/interest-list-form";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { LAUNCH_CRITERIA, launchGaps, verifyAllTrades } from "@/lib/launch-verification";
import { TRADE_PAGES } from "@/lib/trade-pages";
import { TRADE_PLAYBOOKS } from "@/lib/trade-playbooks";
import { tradeScope } from "@/lib/trade-scope";
import { LAUNCH_TRADES, TRADES } from "@/lib/trades";

export const metadata: Metadata = {
  title: "Trades Orvius supports",
  description:
    "The exact trades and jobs Orvius answers and books today, what it hands to you instead, and the interest list for everything else.",
  alternates: { canonical: "/trades" },
};

export default function TradesPage() {
  const results = verifyAllTrades();
  const open = LAUNCH_TRADES.map((trade) => tradeScope(trade)).filter((s) => s !== null);
  const waiting = results.filter((r) => !LAUNCH_TRADES.includes(r.trade));
  const interestTrades = TRADES.filter((t) => !LAUNCH_TRADES.includes(t));

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Trades we support"
            title="Open for the work we've tested. Nothing else is promised."
            subline={`${open.map((s) => s.trade).join(", ")}, for the jobs listed below.`}
            description="A trade opens only when a shop in it can set up its own services, have calls sorted correctly, get work booked inside its real hours and team, hear about changes and failures, and have anything unsafe or unsupported handed to a person. Every one of those is checked by an automated test on every change."
            actions={
              <a href="#interest" className="ov-btn ov-btn--quiet">
                Join the interest list
              </a>
            }
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap">
          <h2 className="tier1-section-title type-headline">The five checks</h2>
          <ol className="tier1-plan-list font-sans">
            {LAUNCH_CRITERIA.map((c) => (
              <li key={c.key}>{c.label}</li>
            ))}
          </ol>
        </div>
      </section>

      {open.map((scope) => {
        const page = TRADE_PAGES.find((p) => p.trade === scope.trade);
        return (
          <section key={scope.trade} className="tier1-story tier1-story-muted" id={page?.slug}>
            <div className="editorial-wrap">
              <p className="tier1-eyebrow type-eyebrow">Open · passes all five</p>
              <h2 className="tier1-section-title type-headline">{scope.trade}</h2>
              <p className="tier1-section-lead font-sans">{scope.customers}.</p>

              <h3 className="tier1-section-title type-headline mt-8">Jobs it books</h3>
              <ul className="tier1-plan-list font-sans">
                {scope.workflows.map((w) => (
                  <li key={w.key}>{w.label}</li>
                ))}
              </ul>

              <h3 className="tier1-section-title type-headline mt-8">Handed to you right away, never booked</h3>
              <ul className="tier1-plan-list font-sans">
                {TRADE_PLAYBOOKS[scope.trade].safety.map((rule) => (
                  <li key={rule.key}>{rule.label}</li>
                ))}
                <li>Callers who ask for a person</li>
              </ul>

              <h3 className="tier1-section-title type-headline mt-8">Not covered yet: taken as a message for you to call back</h3>
              <ul className="tier1-plan-list font-sans">
                {scope.notCovered.map((n) => (
                  <li key={n.key}>{n.label}</li>
                ))}
              </ul>
              {page ? (
                <p className="tier1-section-lead font-sans">
                  <Link href={`/for/${page.slug}`} className="customer-timeline-link">
                    More about Orvius for {page.noun} →
                  </Link>
                </p>
              ) : null}
            </div>
          </section>
        );
      })}

      <section className="tier1-story" id="interest">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <p className="tier1-eyebrow type-eyebrow">Interest list</p>
          <h2 className="tier1-section-title type-headline">Not open yet</h2>
          <p className="tier1-section-lead font-sans">
            These trades are checked the same way and haven&apos;t passed. Rather than sign you up for something that would let your
            customers down, we&apos;ll tell you when yours does.
          </p>
          <ul className="tier1-plan-list font-sans">
            {waiting.map((r) => (
              <li key={r.trade}>
                <strong>{r.trade}</strong>: still missing {launchGaps(r).join(", ")}.
              </li>
            ))}
            <li>
              <strong>Offices</strong> (salons, auto repair, law, real estate): not checked yet. Dental and medical offices also need a
              HIPAA agreement first.
            </li>
          </ul>
          <div className="tier1-form-slot" style={{ marginTop: "1.5rem" }}>
            <InterestListForm trades={interestTrades} />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
