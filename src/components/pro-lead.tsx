import type { ReactNode } from "react";

export type LeadFact = {
  label: string;
  value: string | number;
  /* Something is waiting on the owner. */
  live?: boolean;
};

type ProLeadProps = {
  /** The number the owner opened this page to see. */
  figure: string;
  /** Short noun label for the figure, e.g. "Open jobs". */
  caption: string;
  /** Only when it changes what the owner does next. */
  detail?: string;
  facts?: LeadFact[];
  action?: ReactNode;
  /** Hold figures until they are real rather than painting a confident 0. */
  loading?: boolean;
};

export function ProLead({ figure, caption, detail, facts, action, loading = false }: ProLeadProps) {
  const metrics: LeadFact[] = [{ label: caption, value: figure }, ...(facts ?? [])];
  return (
    <section className="ms font-sans" aria-label="Summary">
      <div className="ms-row">
        <dl className="ms-facts">
          {metrics.map((metric, index) => (
            <div key={metric.label} className={`ms-cell${index === 0 ? " is-primary" : ""}${metric.live ? " is-live" : ""}`}>
              <dt>{metric.label}</dt>
              <dd>{loading ? <span className="ms-wait" aria-hidden /> : metric.value}</dd>
            </div>
          ))}
        </dl>
        {action && !loading ? <div className="ms-action">{action}</div> : null}
      </div>
      {detail && !loading ? <p className="ms-note">{detail}</p> : null}
    </section>
  );
}
