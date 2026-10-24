import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { FindRequestForm } from "@/components/find-request-form";
import { findShops, parseFindQuery } from "@/lib/find-shop";
import { LAUNCH_TRADES } from "@/lib/trades";

export const metadata: Metadata = {
  title: "Find a shop",
  description: "Search HVAC, plumbing, and electrical shops that answer on Orvius, by ZIP code.",
  alternates: { canonical: "/find" },
};

type Props = { searchParams: Promise<{ trade?: string; zip?: string }> };

export default async function FindPage({ searchParams }: Props) {
  const queryIn = await searchParams;
  const query = parseFindQuery({ trade: queryIn.trade, zip: queryIn.zip });
  const shops = query ? await findShops(query) : [];
  const searched = Boolean(queryIn.trade || queryIn.zip);

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Find a shop"
            title="A shop that answers, in the area you named."
            subline="HVAC, plumbing, and electrical. The number on the listing is the one the receptionist answers."
            description="A shop is listed when its line is on. A review is a finished visit, told by the customer who had the work done."
          />
          <form className="font-sans" action="/find" method="get">
            <label>
              Trade
              <select className="input" name="trade" defaultValue={query?.trade ?? queryIn.trade ?? "HVAC"}>
                {LAUNCH_TRADES.map((trade) => (
                  <option key={trade} value={trade}>
                    {trade}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ZIP code
              <input className="input" name="zip" inputMode="numeric" autoComplete="postal-code" required defaultValue={queryIn.zip ?? ""} placeholder="60614" />
            </label>
            <button type="submit" className="ov-btn ov-btn--solid">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap font-sans">
          {query && shops.length ? (
            <ul className="tier1-plan-list">
              {shops.map((shop) => (
                <li key={shop.slug}>
                  <strong>{shop.name}</strong>
                  <span>
                    {" "}
                    · {shop.trade} · {shop.area}
                  </span>
                  {shop.reviewLine ? <p>{shop.reviewLine}</p> : null}
                  <p>
                    <a href={`tel:${shop.phone}`}>{shop.phoneDisplay}</a>
                    {shop.bookingPath ? (
                      <>
                        {" "}
                        · <Link href={shop.bookingPath}>Book a time</Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {query && !shops.length ? (
            <p>No {query.trade} shop in {query.zip3}xx answers on Orvius yet.</p>
          ) : null}
          {searched && !query ? <p>Choose HVAC, plumbing, or electrical, and a ZIP code.</p> : null}

          {query ? (
            <>
              <h2 className="tier1-section-title">Ask Orvius for a shop</h2>
              <p className="tier1-section-lead">
                The first live {query.trade} shop in {query.zip3}xx can take this from their desk.
              </p>
              <FindRequestForm trade={query.trade} zip={query.zip3} />
            </>
          ) : null}
        </div>
      </section>
    </MarketingShell>
  );
}
