"use client";

import { CustomerPanel } from "@/components/customer-panel";
import { CustomerRecordCard } from "@/components/customer-record-card";
import { ProLead } from "@/components/pro-lead";
import {
  ProSearchBar,
  ProEmptyState,
  ProListEnd,
} from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CustomerRow = {
  id: string;
  name: string | null;
  displayName: string;
  phone: string;
  email: string | null;
  address: string | null;
  interactionCount: number;
  lastSeenAt: string;
  returning: boolean;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const url = query.trim()
        ? `/api/customers?q=${encodeURIComponent(query.trim())}`
        : "/api/customers";

      setLoading(true);
      setError(null);
      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("Failed to load customers");
          return res.json();
        })
        .then((data) => setCustomers(data.customers ?? []))
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Failed to load customers");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const tally = useMemo(() => {
    const returning = customers.filter((c) => c.returning).length;
    const touchpoints = customers.reduce((sum, c) => sum + c.interactionCount, 0);
    return {
      returning,
      touchpoints,
      /*
        Repeat rate is the number that decides whether a shop grows, so it leads
        this page rather than the headcount. Withheld below ten customers: one
        repeat out of three is 33% and means nothing.
      */
      repeatRate:
        customers.length >= 10
          ? `${Math.round((returning / customers.length) * 100)}%`
          : null,
    };
  }, [customers]);

  const activeId = customers.some((c) => c.id === selectedId) ? selectedId : (customers[0]?.id ?? null);

  return (
    <OsShell
      title="Customers"
      subtitle="Every customer, their properties, and the full history of work."
    >
      <PlanUpgradeGate module="customers">
      {loading && !customers.length ? (
        <DashboardSkeleton />
      ) : (
        <>
          <ProLead
            loading={loading && !customers.length}
            figure={tally.repeatRate ?? String(customers.length)}
            caption={
              tally.repeatRate
                ? "of your customers called back"
                : customers.length === 1
                  ? "customer on file"
                  : "customers on file"
            }
            detail={
              tally.repeatRate
                ? `${tally.returning} of ${customers.length} have called more than once.`
                : "They appear on their first call and stay linked to every job after."
            }
            facts={
              tally.repeatRate
                ? [
                    { label: "customers", value: customers.length },
                    { label: "touchpoints", value: tally.touchpoints },
                  ]
                : [
                    {
                      label: "returning",
                      value: tally.returning,
                      live: tally.returning > 0,
                    },
                    { label: "touchpoints", value: tally.touchpoints },
                  ]
            }
          />

          <ProSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search name, phone, address…"
            className="mb-4 max-w-lg"
          />

          {error ? (
            <div className="mb-4">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {loading ? (
            <DashboardSkeleton />
          ) : !customers.length ? (
            <ProEmptyState
              title="No customers yet"
              body="They appear automatically when someone calls or texts your shop line."
              action={
                <div className="flex flex-wrap gap-2">
                  <ProShopLineCta showNumber={false} />
                  <Link href="/dashboard/inbox" className="btn btn-secondary text-sm">
                    Open inbox
                  </Link>
                </div>
              }
            />
          ) : (
            <div className="cp-layout">
            <ul className="os-lead-rail">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <CustomerRecordCard
                    onSelect={() => setSelectedId(customer.id)}
                    selected={customer.id === activeId}
                    id={customer.id}
                    name={customer.name}
                    phone={customer.phone}
                    email={customer.email}
                    address={customer.address}
                    interactionCount={customer.interactionCount}
                    lastSeenAt={customer.lastSeenAt}
                    returning={customer.returning}
                  />
                </li>
              ))}
            </ul>
            <div className="cp-side">
              {activeId ? <CustomerPanel customerId={activeId} /> : null}
            </div>
            </div>
          )}
          {customers.length ? (
            <ProListEnd count={customers.length} noun="customer" />
          ) : null}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
