import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { OVERAGE_CENTS_PER_CALL, getPlanById } from "@/lib/pricing-plans";

const multi = getPlanById("multi");
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: "/enterprise" },
  title: "Enterprise",
  description: `${company.productName} for multi-location businesses: every location side by side, roles for owners, managers and dispatchers, and a record of every change.`,
};

const pillars = [
  {
    id: "01",
    title: "Every location side by side.",
    body: "Calls, leads, booked and completed jobs, money collected, and callers still waiting, per location, over 7, 30 or 90 days. Sorted so the location that needs attention is on top.",
  },
  {
    id: "02",
    title: "Roles that match the job.",
    body: "Owners add managers and dispatchers by email, on every plan. Managers can change settings and the team; dispatchers run calls, leads, jobs and dispatch. One sign-in switches between every location it can open.",
  },
  {
    id: "03",
    title: "A record of every change.",
    body: "Settings, team access, jobs, invoices and exports are logged with who made the change and when. Search it, filter it, and download it as CSV.",
  },
  {
    id: "04",
    title: "Rolled out with you.",
    body: "Each location’s services, hours, service area and escalation rules are set up with you before its line goes live. Card checkout takes one location at a time, so multi-location billing is set up with you on an order form.",
  },
] as const;

/* Fictional locations for the illustration; sorted the way the real board sorts, attention first. */
const boardRows = [
  { name: "Eastgate", calls: 41, booked: 27, waiting: 3, attention: true },
  { name: "Northside", calls: 58, booked: 44, waiting: 1, attention: false },
  { name: "Riverbend", calls: 36, booked: 29, waiting: 0, attention: false },
  { name: "Airport Rd", calls: 22, booked: 17, waiting: 0, attention: false },
];

function LocationBoard() {
  return (
    <figure className="ov-board" aria-label="Illustration of the multi-location board with fictional locations">
      <figcaption className="ov-specimen-label">Illustration · fictional locations, last 7 days</figcaption>
      <table className="ov-board-table">
        <thead>
          <tr>
            <th scope="col">Location</th>
            <th scope="col">Calls</th>
            <th scope="col">Booked</th>
            <th scope="col">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {boardRows.map((r) => (
            <tr key={r.name} data-attention={r.attention || undefined}>
              <th scope="row">
                {r.name}
                {r.attention ? <span className="ov-board-flag">Needs attention</span> : null}
              </th>
              <td>{r.calls}</td>
              <td>{r.booked}</td>
              <td>{r.waiting}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ov-board-foot">Sorted so the location with callers still waiting is on top.</p>
    </figure>
  );
}

export default function EnterprisePage() {
  const [lead, ...rest] = pillars;
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap ov-hero-split">
          <ShellPageIntro
            label="Enterprise"
            title="Every location on one board."
            subline="For franchises, groups and multi-location businesses."
            description="Each location keeps its own line, hours and rules. You see all of them side by side, with every change recorded."
            actions={
              <>
                <a
                  href="mailto:support@orvius.im?subject=Enterprise%20%E2%80%94%20multi-location"
                  className="ov-btn ov-btn--solid"
                >
                  Talk to us
                </a>
                <Link href="/pricing" className="ov-btn ov-btn--quiet">
                  View pricing
                </Link>
              </>
            }
          />
          <div className="ov-hero-aside">
            <LocationBoard />
          </div>
        </div>
      </section>

      <section className="tier1-story ov-chapter">
        <div className="editorial-wrap">
          <div className="ov-lead-module">
            <span className="ov-row-index" aria-hidden>
              {lead.id}
            </span>
            <div>
              <h2 className="ov-lead-title">{lead.title}</h2>
              <p className="ov-lead-body">{lead.body}</p>
            </div>
          </div>
          <ol className="ov-rows ov-rows--three font-sans">
            {rest.map((c) => (
              <li key={c.id} className="ov-row">
                <span className="ov-row-index" aria-hidden>
                  {c.id}
                </span>
                <div>
                  <h2 className="ov-row-title">{c.title}</h2>
                  <p className="ov-row-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tier1-story tier1-bridge ov-surface-anchor">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">
              Talk through your footprint.
            </h2>
            <p className="tier1-section-lead font-sans">
              Multi-shop is ${multi.price} per location a month for {multi.limit?.toLowerCase()}, with
              Pro and {(multi.includedCalls ?? 0).toLocaleString("en-US")} answered calls at each location
              ({OVERAGE_CENTS_PER_CALL}¢ per call past that). Tell us how many locations you run and
              we&apos;ll set them up with you.
            </p>
          </div>
          <div className="tier1-actions">
            <a
              href="mailto:support@orvius.im?subject=Enterprise%20%E2%80%94%20multi-location"
              className="ov-btn ov-btn--solid"
            >
              Talk to us
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
