import { OsShell } from "@/components/os-shell";

export default function DashboardLoading() {
  return (
    <OsShell title="Loading" subtitle="Loading the latest shop state…">
      <section className="dashboard-route-loading" aria-busy="true">
        <div className="dashboard-route-loading-main">
          <span className="skeleton dashboard-route-loading-value" />
          <div className="dashboard-route-loading-metrics">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        </div>
        <aside className="dashboard-route-loading-rail">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </aside>
      </section>
    </OsShell>
  );
}
