export function SkeletonBar({
  className = "",
  wide = false,
}: {
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`skeleton ${wide ? "h-10 w-full" : "h-4 w-24"} rounded-md ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonStat() {
  return (
    <div className="card p-5 md:p-6">
      <SkeletonBar className="h-3 w-20" />
      <SkeletonBar wide className="mt-3 h-8 max-w-[4rem]" />
    </div>
  );
}

export function SkeletonLeadCard() {
  return (
    <div className="lead-inbox-card p-5">
      <div className="flex justify-between gap-3 border-b border-rule pb-3">
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

export function DashboardSkeleton() {
  return (
    <div className="animate-pulse-soft" aria-busy="true" aria-label="Loading dashboard">
      <div className="live-status-bar mb-8">
        <SkeletonBar wide className="h-5 max-w-md" />
      </div>
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
