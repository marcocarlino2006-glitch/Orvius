const spine =
  "Every call becomes a qualified customer, every customer becomes a scheduled job, and every job stays organized until it gets paid.";

const stages = [
  {
    name: "Call",
    body: "Orvius answers the phone — nights, weekends, and when every tech is on a roof. Urgency, address, and callback land in your inbox.",
  },
  {
    name: "Jobs",
    body: "Qualified leads become booked appointments on the calendar. No sticky notes. No “I’ll call them back later.”",
  },
  {
    name: "Dispatch",
    body: "Assign the right tech, advance status from en route to done, and keep the day running from one board.",
  },
  {
    name: "Ask",
    body: "Your shop memory — ask who called, what’s unassigned, or how the week booked. Answers link back to the record.",
  },
] as const;

/** Plain-language workflow before product jargon. */
export function HomeWorkflow() {
  return (
    <section className="home-workflow" aria-labelledby="home-workflow-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">The job</p>
        <h2 id="home-workflow-heading" className="tier1-section-title type-headline">
          From the ring to paid work — one path.
        </h2>
        <p className="home-workflow-spine font-sans">{spine}</p>

        <ol className="home-workflow-stages font-sans">
          {stages.map((stage) => (
            <li key={stage.name} className="home-workflow-stage">
              <h3 className="home-workflow-stage-name">{stage.name}</h3>
              <p className="home-workflow-stage-body">{stage.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
