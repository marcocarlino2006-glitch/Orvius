const path = [
  { step: "Answer", status: "live" as const, body: "Every inbound call and text." },
  { step: "Qualify", status: "live" as const, body: "Service, urgency, address, callback." },
  { step: "Book", status: "live" as const, body: "Lead becomes a scheduled job." },
  { step: "Dispatch", status: "live" as const, body: "Assign tech. Advance status." },
  { step: "Invoice", status: "live" as const, body: "Estimate → invoice on the job." },
  {
    step: "Get paid",
    status: "next" as const,
    body: "Manual payment recorded now. Card rails next.",
  },
] as const;

/** Full future of Orvius — live vs next, no vapor. */
export function HomeOsPath() {
  return (
    <section className="home-os-path" aria-labelledby="home-os-path-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">The path</p>
        <h2 id="home-os-path-heading" className="tier1-section-title type-headline">
          Answer, qualify, book, dispatch, invoice, get paid.
        </h2>
        <p className="tier1-section-lead font-sans">
          Front door is live today. Money tracking is live for drafts and manual
          payment. Card checkout rails are next — we say so out loud.
        </p>

        <ol className="home-future-path font-sans">
          {path.map((item) => (
            <li
              key={item.step}
              className={`home-future-step home-future-step-${item.status}`}
            >
              <div className="home-future-step-head">
                <span className="home-future-step-name">{item.step}</span>
                <span className="home-future-step-status">
                  {item.status === "live" ? "Live" : "Next"}
                </span>
              </div>
              <p className="home-future-step-body">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
