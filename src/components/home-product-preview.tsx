/** Stripe/Linear-style product frame — command center, not a decorative card. */
export function HomeProductPreview() {
  return (
    <div className="mkt-product" aria-hidden>
      <div className="mkt-product-chrome">
        <div className="mkt-product-dots">
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

      <div className="mkt-product-body">
        <header className="mkt-product-head">
          <div>
            <p className="mkt-product-kicker">Command</p>
            <p className="mkt-product-title">3 need attention</p>
          </div>
          <span className="mkt-product-shop">Summit HVAC</span>
        </header>

        <ul className="mkt-product-queue">
          <li className="mkt-product-row mkt-product-row-hot">
            <span className="mkt-product-row-tag">Emergency</span>
            <span className="mkt-product-row-main">AC down · Oak St</span>
            <span className="mkt-product-row-action">Assign</span>
          </li>
          <li className="mkt-product-row">
            <span className="mkt-product-row-tag">After hours</span>
            <span className="mkt-product-row-main">No hot water · 411 Pine</span>
            <span className="mkt-product-row-action">Inbox</span>
          </li>
          <li className="mkt-product-row">
            <span className="mkt-product-row-tag">Unassigned</span>
            <span className="mkt-product-row-main">Annual maintenance · 8:00 AM</span>
            <span className="mkt-product-row-action">Dispatch</span>
          </li>
        </ul>

        <div className="mkt-product-alert">
          <p className="mkt-product-alert-kicker">Owner alert · SMS sent</p>
          <p className="mkt-product-alert-title">Maria Lopez · Emergency AC</p>
          <p className="mkt-product-alert-meta">1842 Oak St · Booked today</p>
        </div>
      </div>
    </div>
  );
}
