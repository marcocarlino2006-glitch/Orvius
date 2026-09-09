import { ownerSlAs } from "@/lib/institutional-standards";

/**
 * The proof strip under the hero.
 *
 * Every figure here is a standard Orvius enforces in code and can be checked
 * against the repository, not a customer average we have not measured. That
 * rules out the usual banner numbers: a total-coverage percentage or a
 * zero-missed-revenue figure is the kind of claim
 * docs/INSTITUTIONAL-PLAYBOOK.md says we have not earned, and
 * `npm run standard:check` flags them on sight.
 */
const STATS = [
  {
    value: "24/7",
    label: "After-hours & overflow",
    note: `Coverage ${ownerSlAs.lineCoverageLabel.toLowerCase()}.`,
  },
  {
    value: `< ${ownerSlAs.alertP95TargetSec}s`,
    label: "Owner-alert standard",
    note: "P95 target, measured per shop on your dashboard.",
  },
  {
    value: "0",
    label: "Invented prices or windows",
    note: "Contracted in the prompt, regression-tested by npm run ai:eval.",
  },
] as const;

export function HomeStatsBanner() {
  return (
    <section className="ov-stats" aria-label="Operating standards">
      <div className="ov-stats-inner">
        {STATS.map((stat) => (
          <div key={stat.label} className="ov-stat">
            <p className="ov-stat-value">{stat.value}</p>
            <p className="ov-stat-label">{stat.label}</p>
            <p className="ov-stat-note">{stat.note}</p>
          </div>
        ))}
      </div>
      <p className="ov-stats-foot">
        Operating standards Orvius holds itself to and enforces in code — not
        averaged customer results.
      </p>
    </section>
  );
}
