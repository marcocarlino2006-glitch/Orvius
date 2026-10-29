/*
  Where Cursor shows customer logos, we show what every call gets. Each line is
  something a visitor can check by dialing the live line. Above it, the one path
  a call takes in a shop's record: the same five steps the owner's desk reads.
*/
const path = [
  { title: "Answered", body: "Picked up in your name, any hour." },
  { title: "Booked", body: "Address, problem and window on your calendar." },
  { title: "Confirmed", body: "The customer gets a text with the time." },
  { title: "Done", body: "Your tech closes the job from the field." },
  { title: "Paid", body: "A card link, then it shows on the call." },
] as const;

const facts = [
  { title: "Answers in your business's name", body: "After hours and overflow, in your opening line." },
  { title: "English and Spanish", body: "It switches when the caller does." },
  { title: "Safety first", body: "Gas, smoke, a shock, and sewage go to you first." },
  { title: "Every call on the record", body: "Recorded, transcribed, and graded." },
] as const;

export function HomeStatement() {
  return (
    <section className="hx-facts" aria-label="What every call gets">
      <p className="hx-facts-caption font-sans">One call, from the ring to the payment</p>
      <ol className="hx-facts-row hx-facts-row--path font-sans">
        {path.map((s, i) => (
          <li key={s.title} className="hx-fact">
            <p className="hx-fact-step" aria-hidden>
              {i + 1}
            </p>
            <p className="hx-fact-title">{s.title}</p>
            <p className="hx-fact-body">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="hx-facts-caption hx-facts-caption--second font-sans">What every call gets</p>
      <ul className="hx-facts-row font-sans">
        {facts.map((f) => (
          <li key={f.title} className="hx-fact">
            <p className="hx-fact-title">{f.title}</p>
            <p className="hx-fact-body">{f.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
