type MktSectionProps = {
  id?: string;
  tone?: "light" | "dark" | "inset";
  children: React.ReactNode;
  className?: string;
  "aria-labelledby"?: string;
};

/** Marketing section shell — Stripe-style light / dark rhythm. */
export function MktSection({
  id,
  tone = "light",
  children,
  className = "",
  "aria-labelledby": labelledBy,
}: MktSectionProps) {
  return (
    <section
      id={id}
      className={`mkt-section mkt-section-${tone} ${className}`.trim()}
      aria-labelledby={labelledBy}
    >
      <div className="editorial-wrap mkt-section-inner">{children}</div>
    </section>
  );
}

type MktSectionHeaderProps = {
  kicker: string;
  title: string;
  lead?: string;
  titleId?: string;
  light?: boolean;
};

export function MktSectionHeader({
  kicker,
  title,
  lead,
  titleId,
  light,
}: MktSectionHeaderProps) {
  return (
    <header className={`mkt-section-header ${light ? "mkt-section-header-light" : ""}`}>
      <p className="mkt-kicker">{kicker}</p>
      <h2 id={titleId} className="mkt-section-title">
        {title}
      </h2>
      {lead ? <p className="mkt-section-lead font-sans">{lead}</p> : null}
    </header>
  );
}
