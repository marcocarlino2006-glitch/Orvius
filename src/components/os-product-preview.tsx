import Link from "next/link";

export function OsProductPreview() {
  return (
    <div className="os-preview">
      <div className="os-preview-chrome" aria-hidden>
        <span className="os-preview-dot" />
        <span className="os-preview-dot" />
        <span className="os-preview-dot" />
      </div>
      <div className="os-preview-body">
        <div className="os-preview-sidebar">
          <p className="px-2 font-serif text-sm tracking-[-0.03em] text-void">Orvius</p>
          <p className="px-2 mt-1 font-sans text-[9px] font-bold tracking-[0.16em] text-ash uppercase">
            OS
          </p>
          <nav className="mt-4 space-y-1">
            <span className="os-preview-nav-item">Overview</span>
            <span className="os-preview-nav-item">Inbox</span>
            <span className="os-preview-nav-item os-preview-nav-item-active">
              Customers
            </span>
            <span className="os-preview-nav-item">Calls</span>
          </nav>
        </div>
        <div className="os-preview-main">
          <p className="font-serif text-lg tracking-[-0.03em] text-void">Overview</p>
          <p className="mt-1 font-sans text-[11px] text-ash">
            Ring 1 + Ring 2 live
          </p>
          <div className="os-preview-stat-row mt-4">
            <div className="os-preview-stat">
              <p>Customers</p>
              <p>24</p>
            </div>
            <div className="os-preview-stat">
              <p>Leads</p>
              <p>31</p>
            </div>
            <div className="os-preview-stat">
              <p>Calls</p>
              <p>28</p>
            </div>
          </div>
          <div className="os-preview-card">
            <p className="font-sans text-[10px] font-bold tracking-[0.16em] text-flare uppercase">
              Returning
            </p>
            <p className="mt-1 font-serif text-base text-void">Maria Lopez</p>
            <p className="mt-1 font-sans text-[11px] text-ash">
              3 interactions · AC not cooling
            </p>
          </div>
          <div className="os-preview-card">
            <p className="font-sans text-[10px] font-bold tracking-[0.16em] text-live uppercase">
              New lead
            </p>
            <p className="mt-1 font-serif text-base text-void">Emergency · Same day</p>
            <p className="mt-1 font-sans text-[11px] text-ash">
              Owner alerted · 1842 Oak St
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OsProductPreviewSection() {
  return (
    <section className="editorial-section editorial-section-muted">
      <div className="editorial-wrap editorial-split">
        <div className="editorial-copy">
          <h2 className="editorial-heading font-serif">The OS, not a feature.</h2>
          <p className="editorial-body font-sans">
            One workspace for the front door and every customer who calls. Ring 1
            captures leads. Ring 2 remembers them forever.
          </p>
          <Link
            href="/dashboard"
            className="editorial-link editorial-link-inline font-sans"
          >
            Open the product →
          </Link>
        </div>
        <OsProductPreview />
      </div>
    </section>
  );
}
