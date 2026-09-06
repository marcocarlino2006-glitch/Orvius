"use client";

import { CustomerRecordCard } from "@/components/customer-record-card";
import {
  ProSearchBar,
  ProStatRow,
  ProEmptyState,
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

  useEffect(() => {
    const url = query.trim()
      ? `/api/customers?q=${encodeURIComponent(query.trim())}`
      : "/api/customers";

    setLoading(true);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load customers");
        return res.json();
      })
      .then((data) => setCustomers(data.customers ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  const stats = useMemo(() => {
    const returning = customers.filter((c) => c.returning).length;
    const totalInteractions = customers.reduce((sum, c) => sum + c.interactionCount, 0);
    return [
      { label: "Customers", value: customers.length },
      { label: "Returning", value: returning, highlight: returning > 0 },
      { label: "Touchpoints", value: totalInteractions },
      {
        label: "Avg per customer",
        value: customers.length
          ? Math.round((totalInteractions / customers.length) * 10) / 10
          : "—",
      },
    ];
  }, [customers]);

  return (
    <OsShell title="Customers">
      <PlanUpgradeGate module="customers">
      {loading && !customers.length ? (
        <DashboardSkeleton />
      ) : (
        <>
          {!loading ? <ProStatRow stats={stats} className="pro-page-stats" /> : null}

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
            <ul className="os-lead-rail">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <CustomerRecordCard
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
          )}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
