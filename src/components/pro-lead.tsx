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
 * How every list page opens.
 *
 * What it replaces was two components stacked. First a banner repeating the
 * shop's phone number with a "Test call" button — and the number was already
 * in the page header directly above it and in the sidebar to its left, so the
 * top of seven screens out of ten was spent saying a thing twice. Then a strip
 * of four to six identical bordered boxes, which is the house style of every
 * admin template ever shipped, and which on a shop with one lead rendered as
 * five framed zeros.
 *
 * So: one figure, at the only display size in the product, naming what the page
 * is about. The rest of the counts sit under it as a line of text. Anything
 * genuinely actionable goes in the action slot, once.
 */
export function ProLead({
  figure,
  caption,
  detail,
  facts,
  action,
  loading = false,
}: ProLeadProps) {
  /*
    The figure earns the brand colour only when it is not a standing start.
    A rust-coloured 0 reads as an alarm about nothing.
  */
  const hot = !loading && figure !== "0" && figure !== "$0" && figure !== "—";

  return (
    <div className="pro-lead">
      <div className="pro-lead-main font-sans">
        {/*
          The figure is hidden from assistive tech and folded into the heading
          below it instead. Split across two elements it announced as "16" and
          then, separately, "calls answered" — and the heading it replaced on
          the Command board was the only h2 on that page, so dropping it left
          the queue's h3 item titles jumping straight from the page h1.
        */}
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
      </div>

      <div className="pro-lead-side">
        {facts?.length && !loading ? (
          <ul className="pro-lead-facts font-sans">
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
