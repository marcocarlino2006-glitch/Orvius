"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DomainPlan = {
  domains: {
    primary: string;
    marketing: string;
    app: string;
    api: string;
  };
  candidates: Array<{
    domain: string;
    status: string;
    note: string;
    tier: string;
  }>;
  publicAppUrl: string;
  webhookUrls: { vapi: string; twilioSms: string };
  dns: {
    provider: string;
    records: Array<{
      type: string;
      name: string;
      value: string;
      purpose: string;
    }>;
    env: Record<string, string>;
  };
  emailSuggestions: Array<{ address: string; use: string }>;
};

export default function DomainsPage() {
  const [plan, setPlan] = useState<DomainPlan | null>(null);

  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then(setPlan)
      .catch(() => null);
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <Link href="/" className="text-sm text-sky-300 hover:underline">
          ← Orvius
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">Domain strategy</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Pick a domain, wire DNS, set env vars — then webhooks and the app run
          on your brand instead of a temp tunnel.
        </p>
      </header>

      <section className="card mb-8 p-6">
        <h2 className="text-lg font-semibold">Your domain: orvius.im</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted">
          <li>
            <strong className="text-foreground">Remove Manus DNS:</strong> delete
            the <code>cname.manus.space</code> record in your registrar
          </li>
          <li>
            <strong className="text-foreground">Deploy to Vercel</strong> and
            add <code>orvius.im</code>, <code>app.orvius.im</code>,{" "}
            <code>api.orvius.im</code> as custom domains
          </li>
          <li>
            <strong className="text-foreground">Paste DNS records</strong> from
            the table below (Vercel will show exact values)
          </li>
          <li>
            <strong className="text-foreground">Set env:</strong>{" "}
            <code>NEXT_PUBLIC_APP_URL=https://api.orvius.im</code>
          </li>
        </ol>
      </section>

      {plan && (
        <>
          <section className="card mb-8 p-6">
            <h2 className="mb-4 text-lg font-semibold">Domain candidates</h2>
            <div className="space-y-3">
              {plan.candidates.map((item) => (
                <div
                  key={item.domain}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
                >
                  <div>
                    <p className="font-medium">{item.domain}</p>
                    <p className="text-sm text-muted">{item.note}</p>
                  </div>
                  <div className="flex gap-2">
                    <TierBadge tier={item.tier} />
                    <StatusBadge status={item.status} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card mb-8 p-6">
            <h2 className="mb-4 text-lg font-semibold">Target architecture</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <HostCard label="Marketing" host={plan.domains.marketing} />
              <HostCard label="App (admin)" host={plan.domains.app} />
              <HostCard label="API (webhooks)" host={plan.domains.api} />
              <HostCard label="Primary brand" host={plan.domains.primary} />
            </div>
          </section>

          <section className="card mb-8 p-6">
            <h2 className="mb-4 text-lg font-semibold">
              DNS records ({plan.dns.provider})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Value</th>
                    <th className="pb-2">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.dns.records.map((record) => (
                    <tr key={`${record.type}-${record.name}`} className="border-t border-border">
                      <td className="py-3 pr-4 font-mono">{record.type}</td>
                      <td className="py-3 pr-4 font-mono">{record.name}</td>
                      <td className="py-3 pr-4 font-mono text-sky-300">
                        {record.value}
                      </td>
                      <td className="py-3 text-muted">{record.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card mb-8 p-6">
            <h2 className="mb-4 text-lg font-semibold">Environment variables</h2>
            <pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-sm leading-relaxed">
              {Object.entries(plan.dns.env)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n")}
            </pre>
            <div className="mt-4 space-y-2 text-sm text-muted">
              <p>Webhook URLs after deploy:</p>
              <p className="font-mono text-foreground">{plan.webhookUrls.vapi}</p>
              <p className="font-mono text-foreground">
                {plan.webhookUrls.twilioSms}
              </p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 text-lg font-semibold">Email addresses to set up</h2>
            <ul className="space-y-2 text-sm">
              {plan.emailSuggestions.map((item) => (
                <li key={item.address} className="flex justify-between gap-4 border-t border-border pt-2">
                  <span className="font-mono">{item.address}</span>
                  <span className="text-muted">{item.use}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function HostCard({ label, host }: { label: string; host: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-mono">{host}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    ideal: "bg-purple-500/15 text-purple-300",
    recommended: "bg-green-500/15 text-green-300",
    good: "bg-sky-500/15 text-sky-300",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs ${colors[tier] ?? ""}`}>
      {tier}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    owned: "bg-green-500/15 text-green-300",
    taken: "bg-red-500/15 text-red-300",
    likely_available: "bg-green-500/15 text-green-300",
  };
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs ${
        colors[status] ?? "bg-sky-500/15 text-sky-300"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
