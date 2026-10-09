import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketingShell } from "@/components/marketing-shell";
import { TalkInBrowser } from "@/components/talk-in-browser";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { matchTrade } from "@/lib/hear-link";
import { isHipaaTrade } from "@/lib/trades";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 80) ?? "";

async function read(searchParams: Props["searchParams"]) {
  const q = await searchParams;
  const trade = matchTrade(one(q.t));
  return { name: one(q.b), trade: trade && !isHipaaTrade(trade) ? trade : null, city: one(q.c) };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { name } = await read(searchParams);
  if (!name) return { title: "Hear your business answer" };
  const title = `Hear Orvius answer the phone as ${name}`;
  const description = "Tap and talk to it like one of your customers would. 20 seconds, no signup.";
  return { title, description, robots: { index: false }, openGraph: { title, description }, twitter: { card: "summary", title, description } };
}

/** The page a prospect's personal link opens: their business already filled in, one tap to talk. */
export default async function HearPage({ searchParams }: Props) {
  const { name, trade, city } = await read(searchParams);
  if (name.length < 2) redirect("/try");
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap lx-wrap">
          <p className="tier1-eyebrow type-eyebrow">Made for {name}</p>
          <h1 className="lx-title">Hear Orvius answer as {name}.</h1>
          <p className="lx-lead font-sans">
            Tap below and talk to it like one of your customers calling. It answers as your business, takes down the job, and shows you the text you&apos;d get after the call. No signup.
          </p>
          <TalkInBrowser personal initial={{ name, trade, city }} phoneHref={demoLineHref()} phoneDisplay={DEMO_LINE_DISPLAY} />
        </div>
      </section>
    </MarketingShell>
  );
}
