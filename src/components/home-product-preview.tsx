/** Command center frame — outcome visible at a glance. */
export function HomeProductPreview() {
  return (
    <div className="mkt-product" aria-hidden>
      <div className="mkt-product-chrome">
        <span className="mkt-product-url">command · summit hvac</span>
        <span className="mkt-product-live">
          <span className="mkt-live-dot" />
          3 need attention
        </span>
      </div>

      <div className="mkt-product-body">
        <ul className="mkt-product-queue">
          <li className="mkt-product-row mkt-product-row-hot">
            <span className="mkt-product-row-tag">Emergency</span>
            <span className="mkt-product-row-main">AC down · Oak St</span>
            <span className="mkt-product-row-action">Assign</span>
          </li>
          <li className="mkt-product-row">
            <span className="mkt-product-row-tag">After hours</span>
            <span className="mkt-product-row-main">No hot water · Pine</span>
            <span className="mkt-product-row-action">Inbox</span>
          </li>
          <li className="mkt-product-row">
            <span className="mkt-product-row-tag">Unassigned</span>
            <span className="mkt-product-row-main">Annual · 8 AM</span>
            <span className="mkt-product-row-action">Dispatch</span>
          </li>
        </ul>

        <div className="mkt-product-alert">
          <p className="mkt-product-alert-kicker">Owner alert sent</p>
          <p className="mkt-product-alert-title">Maria Lopez · Emergency AC</p>
          <p className="mkt-product-alert-meta">1842 Oak · booked today</p>
        </div>
      </div>
    </div>
  );
}
