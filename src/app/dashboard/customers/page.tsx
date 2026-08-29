"use client";

import { CustomerRecordCard } from "@/components/customer-record-card";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellEmpty } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import { useEffect, useState } from "react";

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

  return (
    <OsShell
      title="Customers"
      subtitle="Ring 2 — every caller becomes a permanent record with full history."
    >
      <div className="mb-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, address…"
          className="input max-w-md"
        />
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!customers.length ? (
            <ShellEmpty>
              No customers yet. They are created automatically from calls and texts.
            </ShellEmpty>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
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
    </OsShell>
  );
}
