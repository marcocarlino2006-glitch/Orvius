import type { ReactNode } from "react";

export type LeadFact = {
  label: string;
  value: string | number;
  /* Worth the brand colour — something is waiting on the owner. */
  live?: boolean;
};

type ProLeadProps = {
  /** The one number the owner opened this page to see. */
  figure: string;
  /** What that number is, in the owner's words. */
  caption: string;
  /** One clause of context. Omitted rather than padded. */
  detail?: string;
  /** Supporting counts, set inline so a zero cannot pose as a headline. */
  facts?: LeadFact[];
  action?: ReactNode;
  /**
   * Hold the figure until the number is real. Without this the page paints a
   * confident 0 for as long as the fetch takes, which on a shop with sixty open
   * jobs is a lie that then corrects itself — worse than showing nothing.
   */
  loading?: boolean;
};

/**
 * How every list floor opens — title first, figure as support.
 * Not a metric dashboard strip. One job for the floor.
 */
export function ProLead({
  figure,
  caption,
  detail,
  facts,
  action,
  loading = false,
}: ProLeadProps) {
  const hot = !loading && figure !== "0" && figure !== "$0" && figure !== "—";

  return (
    <div className="pro-lead pro-lead--floor font-sans">
      <div className="pro-lead-main">
        <div className="pro-lead-copy">
          <h2
            className="pro-lead-caption os-own-color"
            aria-label={loading ? caption : `${figure} ${caption}`}
          >
            {caption}
          </h2>
          {detail && !loading ? (
            <p className="pro-lead-detail">{detail}</p>
          ) : null}
        </div>
        {loading ? (
          <span className="pro-lead-figure-wait" aria-hidden />
        ) : (
          <p
            aria-hidden
            className={`pro-lead-figure os-own-color ${hot ? "pro-lead-figure-hot" : ""}`}
          >
            {figure}
          </p>
        )}
      </div>

      <div className="pro-lead-side">
        {facts?.length && !loading ? (
          <ul className="pro-lead-facts">
            {facts.map((fact) => (
              <li key={fact.label} className={fact.live ? "is-live" : ""}>
                <b>{fact.value}</b>
                {fact.label}
              </li>
            ))}
          </ul>
        ) : null}
        {loading ? null : action}
      </div>
    </div>
  );
}
