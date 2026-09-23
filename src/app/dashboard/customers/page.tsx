"use client";

import { ClarityEmpty, ClarityFailure } from "@/components/clarity";
import { CustomerRecordCard } from "@/components/customer-record-card";
import { ProLead } from "@/components/pro-lead";
import {
  ProSearchBar,
  ProListEnd,
} from "@/components/pro-page-chrome";
import { ProShopLineCta } from "@/components/pro-shop-line-cta";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { PAGE_CLARITY } from "@/lib/clarity";
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

  return (
    <OsShell title="Customers" clarity={PAGE_CLARITY.customers}>
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
              <ClarityFailure
                title="Customers could not load"
                cause={error}
                impact="You cannot open history or call from a customer record until this recovers."
                recovery="Retry the search, or open Inbox to work from the newest lead."
                action={
                  <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                    Open inbox
                  </Link>
                }
              />
            </div>
          ) : null}

          {loading ? (
            <DashboardSkeleton />
          ) : !customers.length ? (
            <ClarityEmpty
              title="No customers yet"
              body="They appear automatically when someone calls or texts your shop line."
              next="Call your line once, then open the customer that was created from that call."
              consequence="Returning numbers are recognized on the next call — history stays attached."
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
          {customers.length ? (
            <ProListEnd count={customers.length} noun="customer" />
          ) : null}
        </>
      )}
      </PlanUpgradeGate>
    </OsShell>
  );
}
