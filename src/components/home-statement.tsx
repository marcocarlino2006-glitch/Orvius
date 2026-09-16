import { MktSection } from "@/components/mkt-section";

type RuleIcon = "phone" | "board" | "shield";

const nightRules: {
  id: string;
  key: string;
  icon: RuleIcon;
  badge: string;
  title: string;
  body: string;
}[] = [
  {
    id: "01",
    key: "rule1",
    icon: "phone",
    badge: "INTAKE",
    title: "The bay never goes dark.",
    body: "After-hours and overflow get answered, qualified, and alerted — demand does not die on voicemail.",
  },
  {
    id: "02",
    key: "rule2",
    icon: "board",
    badge: "BOARD",
    title: "One board. Not twelve tabs.",
    body: "Every call, text, job, and recorded outcome stays on one customer record. Book and assign from Attention — no CRM scavenger hunt.",
  },
  {
    id: "03",
    key: "rule3",
    icon: "shield",
    badge: "PROOF",
    title: "Proof you can hand a partner.",
    body: "Weekly captured-demand bookings and estimated value copy as a stamped artifact. No vanity dashboards. No invented ARR.",
  },
];

/** Doctrine with institutional mass — three elevated surfaces, not three lonely bullets. */
export function HomeStatement() {
  return (
    <MktSection
      tone="light"
      className="mkt-manifesto mkt-manifesto--meta"
      aria-labelledby="home-manifesto-heading"
    >
      <div className="mkt-manifesto-meta">
        <div className="mkt-manifesto-meta-lead">
          <p className="mkt-manifesto-kicker font-sans" data-i18n="rules.kicker">
            Night rules
          </p>
          <h2
            id="home-manifesto-heading"
            className="mkt-manifesto-title"
            data-i18n="rules.title"
          >
            How the shop runs when you&apos;re not on the floor.
          </h2>
          <p className="mkt-manifesto-aside font-sans" data-i18n="rules.aside">
            Orvius starts as the AI night shift and keeps the operational
            record. The board connects every call, job, confirmation, and
            recorded dollar.
          </p>
        </div>

        <ol className="mkt-laws mkt-laws--grid font-sans">
          {nightRules.map((rule) => (
            <li key={rule.id} className="mkt-law">
              <div className="mkt-law-head">
                <span className="mkt-law-icon" aria-hidden>
                  <RuleGlyph icon={rule.icon} />
                </span>
                <span className="mkt-law-badge">
                  <span aria-hidden>{rule.id}</span>
                  <span className="mkt-law-badge-sep" aria-hidden>
                    /
                  </span>
                  {rule.badge}
                </span>
              </div>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title" data-i18n={`${rule.key}.title`}>
                  {rule.title}
                </h3>
                <p className="mkt-law-body" data-i18n={`${rule.key}.body`}>
                  {rule.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </MktSection>
  );
}

/** Single-stroke glyphs at the card's own scale — no icon dependency. */
function RuleGlyph({ icon }: { icon: RuleIcon }) {
  const shared = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (icon === "phone") {
    return (
      <svg {...shared}>
        <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94" />
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    );
  }

  if (icon === "board") {
    return (
      <svg {...shared}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 9h4M15 13h4" />
        <path d="M6 8h0M6 12h0" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
