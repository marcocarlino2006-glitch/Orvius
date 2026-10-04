/*
  Where Cursor shows customer logos, we show what every call gets. Each line is
  something a visitor can check by dialing the live line.
*/
const facts = [
  { title: "Answers in your business's name", body: "After hours and overflow, with your opening line." },
  { title: "English and Spanish", body: "It switches when the caller does. Records stay in English." },
  { title: "Safety first", body: "Gas leaks, smoke and medical emergencies get safety instructions before anything else." },
  { title: "Every call on the record", body: "Recorded, transcribed and graded, with the rough ones flagged." },
] as const;

export function HomeStatement() {
  return (
    <section className="hx-facts" aria-label="What every call gets">
      <p className="hx-facts-caption font-sans">What every call gets</p>
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
