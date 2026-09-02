"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProEmptyState, ProSectionHead } from "@/components/pro-page-chrome";
import { ProDispatchToday } from "@/components/pro-dispatch-today";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { ProTodayAlerts } from "@/components/pro-today-status";
import {
  TodayPriorityLeads,
  type PriorityLead,
} from "@/components/today-priority-leads";
import { usePlanAccess } from "@/lib/use-plan-access";
import type { ShopHealth } from "@/lib/shop-health";
import type { WedgeReadiness } from "@/lib/wedge-readiness";

type Ring1Data = {
  metrics: {
    newLeads: number;
  };
  priorityLeads: PriorityLead[];
  dispatchToday: {
    jobCount: number;
    unassigned: number;
    jobs: Array<{
      id: string;
      title: string;
      status: string;
      scheduledAt: string | null;
      address: string | null;
      urgency: string | null;
      technicianId?: string | null;
      technician?: { name: string } | null;
      customer?: { name: string | null; phone: string } | null;
      lead?: { name: string | null; phone: string | null } | null;
    }>;
  };
  technicians?: Array<{ id: string; name: string }>;
  health?: ShopHealth;
  wedge?: WedgeReadiness;
};

const REFRESH_MS = 30_000;

export function Ring1CommandCenter() {
  const [data, setData] = useState<Ring1Data | null>(null);
  const [loading, setLoading] = useState(true);
  const { access } = usePlanAccess();
  const canDispatch = access?.canAccess("dispatch") ?? false;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      /* keep last good data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const newLeads = data?.metrics.newLeads ?? 0;
  const hasPriority = (data?.priorityLeads?.length ?? 0) > 0;
  const hasDispatchWork =
    canDispatch &&
    Boolean(data?.dispatchToday) &&
    ((data?.dispatchToday.unassigned ?? 0) > 0 ||
      (data?.dispatchToday.jobCount ?? 0) > 0);

  const empty =
    !loading &&
    !hasPriority &&
    !hasDispatchWork &&
    newLeads === 0 &&
    !(data?.health?.failedAlerts24h) &&
    !(data?.health?.stuckPendingAlerts) &&
    !(data?.wedge && !data.wedge.ready);

  return (
    <section className="ring1-command" aria-label="Today">
      <TodayPriorityLeads
        leads={data?.priorityLeads ?? []}
        technicians={data?.technicians ?? []}
        onUpdate={load}
      />

      <ProTodayAlerts
        health={data?.health ?? null}
        wedge={data?.wedge ?? null}
        newLeads={newLeads}
      />

      {canDispatch && data?.dispatchToday ? (
        <ProDispatchToday
          jobs={data.dispatchToday.jobs}
          unassigned={data.dispatchToday.unassigned}
          jobCount={data.dispatchToday.jobCount}
          technicians={data.technicians ?? []}
          onUpdate={load}
        />
      ) : null}

      {empty ? (
        <div className="ring1-recent">
          <ProSectionHead kicker="Today" title="Nothing waiting" />
          <ProEmptyState
            title="You're clear"
            body="When a lead comes in or a job needs a tech, it lands here."
            action={
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                  Inbox
                </Link>
                <ProShopLineCta label="Test your line" showNumber={false} variant="secondary" />
              </div>
            }
          />
        </div>
      ) : null}
    </section>
  );
}
