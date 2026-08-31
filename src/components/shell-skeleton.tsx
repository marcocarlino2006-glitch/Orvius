export function SkeletonBar({
  className = "",
  wide = false,
}: {
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`ring1-shimmer ${wide ? "h-10 w-full" : "h-4 w-24"} rounded-md ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonStat() {
  return (
    <div className="pro-stat ring1-metric-loading" aria-hidden>
      <SkeletonBar className="ring1-shimmer-label h-3 w-20" />
      <SkeletonBar className="ring1-shimmer-value mt-3 h-8 max-w-[4rem]" />
    </div>
  );
}

export function SkeletonLeadCard() {
  return (
    <div className="lead-inbox-card pro-card p-5" aria-hidden>
      <div className="flex justify-between gap-3 border-b border-rule px-0 pb-3">
        <SkeletonBar className="h-3 w-24" />
        <SkeletonBar className="h-3 w-16" />
      </div>
      <SkeletonBar wide className="mt-4 h-6 max-w-[12rem]" />
      <SkeletonBar className="mt-2 h-3 w-32" />
      <div className="mt-5 space-y-3">
        <SkeletonBar wide className="h-3" />
        <SkeletonBar wide className="h-3" />
        <SkeletonBar wide className="h-3 max-w-[80%]" />
      </div>
    </div>
  );
}

export function SkeletonLiveStrip() {
  return (
    <div className="ring1-live-strip ring1-metric-loading mb-6" aria-hidden>
      <div>
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="mt-2 h-5 w-36" />
      </div>
      <SkeletonBar className="h-9 w-24 rounded-md" />
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading admin">
      <SkeletonLiveStrip />
      <section className="pro-panel mb-8">
        <div className="pro-panel-head">
          <SkeletonBar className="h-4 w-32" />
          <SkeletonBar className="h-6 w-12 rounded-full" />
        </div>
        <div className="pro-panel-body space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pro-list-item flex items-center justify-between">
              <SkeletonBar className="h-4 w-40" />
              <SkeletonBar className="h-4 w-12" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <SkeletonLiveStrip />
      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </section>
      <section>
        <SkeletonBar className="mb-4 h-6 w-40" />
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonLeadCard />
          <SkeletonLeadCard />
          <SkeletonLeadCard />
          <SkeletonLeadCard />
        </div>
      </section>
    </div>
  );
}
