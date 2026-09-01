const CAPABILITIES = [
  {
    num: "01",
    title: "Answer",
    body: "Every call and text qualified — service, urgency, address, callback.",
    preview: (
      <div className="inst-platform-preview" aria-hidden>
        <p className="inst-platform-preview-line">
          <span>Orvius</span>
          Thanks for calling Summit HVAC. How can I help?
        </p>
        <p className="inst-platform-preview-line inst-platform-preview-line-muted">
          <span>Caller</span>
          AC stopped cooling. Can someone come today?
        </p>
      </div>
    ),
  },
  {
    num: "02",
    title: "Inbox",
    body: "Leads land in one queue. Nothing buried in voicemail.",
    preview: (
      <div className="inst-platform-preview" aria-hidden>
        <div className="inst-platform-preview-inbox">
          <span className="inst-platform-preview-badge">New</span>
          <p className="inst-platform-preview-inbox-name">Maria Lopez</p>
          <p className="inst-platform-preview-inbox-meta">Emergency AC · 9:14 PM</p>
        </div>
        <div className="inst-platform-preview-inbox inst-platform-preview-inbox-muted">
          <p className="inst-platform-preview-inbox-name">James Carter</p>
          <p className="inst-platform-preview-inbox-meta">Water heater · This week</p>
        </div>
      </div>
    ),
  },
  {
    num: "03",
    title: "Jobs",
    body: "Book from the inbox. Every appointment on record.",
    preview: (
      <div className="inst-platform-preview" aria-hidden>
        <div className="inst-platform-preview-job">
          <p className="inst-platform-preview-job-time">Today · 2:00 PM</p>
          <p className="inst-platform-preview-job-title">AC repair · Oak Street</p>
          <p className="inst-platform-preview-job-meta">Maria Lopez · Tech assigned</p>
        </div>
      </div>
    ),
  },
  {
    num: "04",
    title: "Dispatch",
    body: "Who goes where today — one board, not group texts.",
    preview: (
      <div className="inst-platform-preview" aria-hidden>
        <div className="inst-platform-preview-dispatch">
          <div className="inst-platform-preview-tech">
            <span className="inst-platform-preview-tech-dot" />
            Mike R. · 2 jobs
          </div>
          <div className="inst-platform-preview-tech">
            <span className="inst-platform-preview-tech-dot inst-platform-preview-tech-dot-live" />
            Sarah K. · En route
          </div>
        </div>
      </div>
    ),
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
            {item.preview}
            <p className="inst-platform-body font-sans">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
