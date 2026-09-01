const CAPABILITIES = [
  {
    num: "01",
    title: "Answer",
    body: "Every call and text qualified — service, urgency, address, callback.",
  },
  {
    num: "02",
    title: "Inbox",
    body: "Leads land in one queue. Nothing buried in voicemail.",
  },
  {
    num: "03",
    title: "Jobs",
    body: "Book from the inbox. Every appointment on record.",
  },
  {
    num: "04",
    title: "Dispatch",
    body: "Who goes where today — one board, not group texts.",
  },
] as const;

export function HomePlatformGrid() {
  return (
    <div className="inst-platform">
      <ul className="inst-platform-grid">
        {CAPABILITIES.map((item) => (
          <li key={item.num} className="inst-platform-item">
            <span className="inst-platform-num type-eyebrow">{item.num}</span>
            <h3 className="inst-platform-title">{item.title}</h3>
            <p className="inst-platform-body font-sans">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
