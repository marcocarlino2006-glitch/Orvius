/** Stripe-tier product frame — real command center, not decoration. */
export function HomeProductPreview() {
  return (
    <div className="mkt-product mkt-product-rich" aria-hidden>
      <div className="mkt-product-shell">
        <aside className="mkt-product-rail">
          <p className="mkt-product-rail-brand">Orvius</p>
          <nav className="mkt-product-rail-nav">
            <span className="mkt-product-rail-active">Command</span>
            <span>Inbox</span>
            <span>Jobs</span>
            <span>Dispatch</span>
          </nav>
        </aside>

        <div className="mkt-product-main">
          <header className="mkt-product-top">
            <div>
              <p className="mkt-product-kicker">Attention queue</p>
              <p className="mkt-product-title">3 items need you</p>
            </div>
            <span className="mkt-product-shop">Summit HVAC</span>
          </header>

          <ul className="mkt-product-queue">
            <li className="mkt-product-row mkt-product-row-hot">
              <span className="mkt-product-row-tag">Emergency</span>
              <span className="mkt-product-row-main">AC down · 1842 Oak St</span>
              <span className="mkt-product-row-action">Assign</span>
            </li>
            <li className="mkt-product-row">
              <span className="mkt-product-row-tag">After hours</span>
              <span className="mkt-product-row-main">No hot water · 411 Pine</span>
              <span className="mkt-product-row-action">Review</span>
            </li>
            <li className="mkt-product-row">
              <span className="mkt-product-row-tag">Unassigned</span>
              <span className="mkt-product-row-main">Annual maintenance · 8:00 AM</span>
              <span className="mkt-product-row-action">Dispatch</span>
            </li>
          </ul>

          <div className="mkt-product-alert">
            <p className="mkt-product-alert-kicker">Owner alert · SMS delivered</p>
            <p className="mkt-product-alert-title">Maria Lopez — emergency AC, booked today</p>
            <p className="mkt-product-alert-meta">1842 Oak St · callback on file</p>
          </div>
        </div>
      </div>
    </div>
  );
}
