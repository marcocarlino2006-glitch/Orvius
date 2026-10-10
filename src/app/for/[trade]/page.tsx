import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { demoLineHref } from "@/lib/demo-line";
import { getLowestPaidPrice } from "@/lib/pricing-plans";
import { TRADE_PAGES, tradePage } from "@/lib/trade-pages";

type Props = { params: Promise<{ trade: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return TRADE_PAGES.map((p) => ({ trade: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = tradePage((await params).trade);
  if (!page) return {};
  return {
    title: `AI receptionist for ${page.noun} companies`,
    description: `Orvius answers your ${page.noun} calls, sorts the urgent ones, books the work on your schedule and texts you the details. From $${getLowestPaidPrice("month")} a month.`,
    alternates: { canonical: `/for/${page.slug}` },
  };
}

export default async function TradePage({ params }: Props) {
  const slug = (await params).trade;
  const page = tradePage(slug);
  if (!page) notFound();

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label={`For ${page.noun} companies`}
            title={`The receptionist that knows ${page.noun} calls.`}
            subline="Answers, sorts the urgent ones, books the work and texts you."
            description={`Orvius picks up when you can't, asks the questions ${page.article} ${page.noun} dispatcher would, books into your open windows and sends you the caller's details.`}
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/pricing" className="ov-btn ov-btn--quiet">
                  See pricing
                </Link>
              </>
            }
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap trade-blocks">
          <section className="trade-block">
            <h2 className="trade-block-title">Jobs it books</h2>
            <p className="trade-block-lead font-sans">
              For homes and small residential properties. Each of these is checked by an automated test before every release.
            </p>
            <ul className="tier1-plan-list font-sans">
              {page.workflows.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>

          {page.urgentSignals.length ? (
            <section className="trade-block">
              <h2 className="trade-block-title">What it treats as urgent</h2>
              <p className="trade-block-lead font-sans">
                These go to the top of your board and to your phone right away, instead of waiting for a booking slot.
              </p>
              <ul className="tier1-plan-list font-sans">
                {page.urgentSignals.map((s) => (
                  <li key={s}>{s[0].toUpperCase() + s.slice(1)}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="trade-block">
            <h2 className="trade-block-title">Set up with your services</h2>
            <p className="trade-block-lead font-sans">
              Your line starts with these and you edit them in Settings. Add a price to any of them and the receptionist can quote it; it never makes one up.
            </p>
            <ul className="tier1-plan-list font-sans">
              {page.services.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>

          {page.notCovered.length ? (
            <section className="trade-block trade-block--muted">
              <h2 className="trade-block-title">Not covered yet</h2>
              <p className="trade-block-lead font-sans">
                Orvius takes a message and texts you to call back. It doesn&apos;t book these or guess at an answer.
              </p>
              <ul className="tier1-plan-list font-sans">
                {page.notCovered.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="trade-block-lead font-sans">
                <Link href="/trades" className="customer-timeline-link">
                  See every trade and how each is checked →
                </Link>
              </p>
            </section>
          ) : null}
        </div>
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <h2 className="tier1-section-title type-headline">Hear it on a real call.</h2>
          <p className="tier1-section-lead font-sans">
            Call the live line and ask for {page.noun} work, the way your customers do.
          </p>
          <div className="tier1-actions tier1-close-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call the live line
            </a>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Book a call audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
