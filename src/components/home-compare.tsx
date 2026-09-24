type Mark = "yes" | "no" | "some";

type Row = { label: string; voicemail: Mark; service: Mark; orvius: Mark; note?: string };

const groups: { title: string; rows: Row[] }[] = [
  {
    title: "Capture",
    rows: [
      { label: "Picks up after hours", voicemail: "no", service: "yes", orvius: "yes" },
      { label: "Picks up overflow during the day", voicemail: "no", service: "yes", orvius: "yes" },
      { label: "Asks trade-specific intake questions", voicemail: "no", service: "some", orvius: "yes" },
    ],
  },
  {
    title: "Booking",
    rows: [
      { label: "Proposes a real appointment window", voicemail: "no", service: "some", orvius: "yes" },
      { label: "Texts the customer a confirmation", voicemail: "no", service: "some", orvius: "yes" },
    ],
  },
  {
    title: "Follow-through",
    rows: [
      { label: "Pages the owner on emergencies", voicemail: "no", service: "yes", orvius: "yes" },
      { label: "Call lands on the customer record", voicemail: "no", service: "no", orvius: "yes" },
      { label: "Tech gets the job on their phone", voicemail: "no", service: "no", orvius: "yes" },
      { label: "Weekly summary of booked value", voicemail: "no", service: "no", orvius: "yes" },
    ],
  },
];

const MARK_LABEL: Record<Mark, string> = { yes: "Yes", no: "No", some: "Varies" };

function Cell({ mark }: { mark: Mark }) {
  return (
    <td className={`hx-mark hx-mark--${mark}`}>
      <span aria-hidden>{mark === "yes" ? "●" : mark === "some" ? "◐" : "—"}</span>
      <span className="sr-only">{MARK_LABEL[mark]}</span>
    </td>
  );
}

export function HomeCompare() {
  return (
    <section
      className="mkt-section mkt-section-dark hx-section hx-compare"
      aria-labelledby="home-compare-heading"
    >
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head" data-reveal>
          <p className="mkt-manifesto-kicker font-sans">Compared</p>
          <h2 id="home-compare-heading" className="hx-title">
            What happens to the 11 PM call.
          </h2>
        </header>

        <div className="hx-table-wrap" data-reveal>
          <table className="hx-table font-sans">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Capability</span>
                </th>
                <th scope="col">Voicemail</th>
                <th scope="col">Answering service</th>
                <th scope="col" className="is-us">
                  Orvius
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.title}>
                <tr className="hx-table-group">
                  <th scope="rowgroup" colSpan={4}>
                    {g.title}
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <Cell mark={r.voicemail} />
                    <Cell mark={r.service} />
                    <Cell mark={r.orvius} />
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="hx-footnote font-sans">
          ◐ Varies by provider and plan. Answering services usually take a message that someone
          still has to call back.
        </p>
      </div>
    </section>
  );
}
