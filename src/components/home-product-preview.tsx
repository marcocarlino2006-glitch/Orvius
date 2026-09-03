/** Dense command-center preview — operations tool, not a decorative card. */
export function HomeProductPreview() {
  return (
    <div className="mkt-product mkt-product-rich" aria-hidden>
      <div className="mkt-product-chrome">
        <div className="mkt-product-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="mkt-product-url">orvius.im/command</span>
        <span className="mkt-product-live">
          <span className="mkt-live-dot" />
          Live
        </span>
      </div>

      <div className="mkt-product-shell">
        <aside className="mkt-product-rail">
          <p className="mkt-product-rail-brand">Orvius</p>
          <nav className="mkt-product-rail-nav">
            <span className="mkt-product-rail-active">Command</span>
            <span>Inbox</span>
            <span>Jobs</span>
            <span>Dispatch</span>
            <span>Ask</span>
          </nav>
          <div className="mkt-product-rail-foot">
            <span className="mkt-product-rail-meta">Summit HVAC</span>
            <span className="mkt-product-rail-meta">Pro</span>
          </div>
        </aside>

        <div className="mkt-product-main">
          <header className="mkt-product-top">
            <div>
              <p className="mkt-product-kicker">Today · attention</p>
              <p className="mkt-product-title">3 need you</p>
            </div>
            <div className="mkt-product-metrics">
              <div>
                <span>Calls</span>
                <strong>14</strong>
              </div>
              <div>
                <span>Booked</span>
                <strong>9</strong>
              </div>
              <div>
                <span>Unassigned</span>
                <strong>2</strong>
              </div>
            </div>
          </header>

          <ul className="mkt-product-queue">
            <li className="mkt-product-row mkt-product-row-hot mkt-product-row-selected">
              <span className="mkt-product-row-tag">Emergency</span>
              <span className="mkt-product-row-main">
                AC down · 1842 Oak St
                <em>Maria Lopez · booked today · SMS sent</em>
              </span>
              <span className="mkt-product-row-action">Assign</span>
            </li>
            <li className="mkt-product-row">
              <span className="mkt-product-row-tag">After hours</span>
              <span className="mkt-product-row-main">
                No hot water · 411 Pine
                <em>Callback captured · awaiting review</em>
              </span>
              <span className="mkt-product-row-action">Review</span>
            </li>
            <li className="mkt-product-row">
              <span className="mkt-product-row-tag">Unassigned</span>
              <span className="mkt-product-row-main">
                Annual maintenance · 8:00 AM
                <em>Ready for dispatch board</em>
              </span>
              <span className="mkt-product-row-action">Dispatch</span>
            </li>
          </ul>

          <div className="mkt-product-detail">
            <div className="mkt-product-detail-col">
              <p className="mkt-product-alert-kicker">Selected job</p>
              <p className="mkt-product-alert-title">Emergency AC · Oak St</p>
              <p className="mkt-product-alert-meta">Tech: unassigned · ETA: today</p>
            </div>
            <div className="mkt-product-detail-actions">
              <span className="mkt-product-chip">Assign tech</span>
              <span className="mkt-product-chip mkt-product-chip-muted">Open inbox</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
