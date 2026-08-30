"use client";

import { OsShell } from "@/components/os-shell";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import {
  ShellBadge,
  ShellEmpty,
  ShellPanel,
} from "@/components/shell-primitives";
import { SkeletonBar } from "@/components/shell-skeleton";
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

function DomainsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading domain plan">
      <ShellPanel title="Loading">
        <SkeletonBar wide className="h-4" />
        <SkeletonBar wide className="mt-3 h-4 max-w-[90%]" />
        <SkeletonBar wide className="mt-3 h-4 max-w-[70%]" />
      </ShellPanel>
    </div>
  );
}

export default function DomainsPage() {
  const [plan, setPlan] = useState<DomainPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then(setPlan)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  return (
    <OsShell
      title="Domain"
      subtitle="Wire orvius.im DNS so marketing, app, and webhooks run on your brand."
      statusLabel="orvius.im"
      actions={
        <a href="/dashboard" className="btn btn-void text-sm">
          Dashboard
        </a>
      }
    >
      <RevealOnScroll>
        <ShellPanel title="Go-live checklist">
          <ol className="list-decimal space-y-3 pl-5 font-sans text-sm leading-relaxed text-ash">
            <li>
              <strong className="text-void">Remove Manus DNS</strong> — delete
              the <code className="text-flare-dim">cname.manus.space</code> record
            </li>
            <li>
              <strong className="text-void">Deploy to Vercel</strong> — add{" "}
              <code className="text-flare-dim">orvius.im</code>,{" "}
              <code className="text-flare-dim">app.orvius.im</code>,{" "}
              <code className="text-flare-dim">api.orvius.im</code>
            </li>
            <li>
              <strong className="text-void">Paste DNS records</strong> from Vercel
              into Namecheap
            </li>
            <li>
              <strong className="text-void">Set env</strong>{" "}
              <code className="text-flare-dim">
                NEXT_PUBLIC_APP_URL=https://api.orvius.im
              </code>
            </li>
          </ol>
        </ShellPanel>
      </RevealOnScroll>

      {loading ? (
        <div className="mt-8">
          <DomainsSkeleton />
        </div>
      ) : !plan ? (
        <div className="mt-8">
          <ShellEmpty>Could not load domain plan.</ShellEmpty>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <RevealOnScroll>
            <ShellPanel title="Domain candidates">
              <ul className="space-y-3">
                {plan.candidates.map((item) => (
                  <li
                    key={item.domain}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-fog/40 px-4 py-3"
                  >
                    <div>
                      <p className="font-sans text-sm font-semibold text-void">
                        {item.domain}
                      </p>
                      <p className="font-sans text-xs text-ash">{item.note}</p>
                    </div>
                    <div className="flex gap-2">
                      <TierBadge tier={item.tier} />
                      <StatusBadge status={item.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </ShellPanel>
          </RevealOnScroll>

          <RevealOnScroll delay={80}>
            <ShellPanel title="Target architecture">
              <div className="grid gap-3 sm:grid-cols-2">
                <HostCard label="Marketing" host={plan.domains.marketing} />
                <HostCard label="App (admin)" host={plan.domains.app} />
                <HostCard label="API (webhooks)" host={plan.domains.api} />
                <HostCard label="Primary brand" host={plan.domains.primary} />
              </div>
            </ShellPanel>
          </RevealOnScroll>

          <RevealOnScroll delay={120}>
            <ShellPanel title={`DNS records (${plan.dns.provider})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-sm">
                  <thead className="text-ash">
                    <tr>
                      <th className="pb-2 pr-4 font-semibold">Type</th>
                      <th className="pb-2 pr-4 font-semibold">Name</th>
                      <th className="pb-2 pr-4 font-semibold">Value</th>
                      <th className="pb-2 font-semibold">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.dns.records.map((record) => (
                      <tr
                        key={`${record.type}-${record.name}`}
                        className="border-t border-rule"
                      >
                        <td className="py-3 pr-4 font-mono text-xs">
                          {record.type}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">
                          {record.name}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-flare-dim">
                          {record.value}
                        </td>
                        <td className="py-3 text-ash">{record.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ShellPanel>
          </RevealOnScroll>

          <RevealOnScroll delay={160}>
            <ShellPanel title="Environment variables">
              <pre className="overflow-x-auto rounded-md border border-rule bg-void p-4 font-mono text-xs leading-relaxed text-chalk">
                {Object.entries(plan.dns.env)
                  .map(([key, value]) => `${key}=${value}`)
                  .join("\n")}
              </pre>
              <div className="mt-4 space-y-2 font-sans text-sm text-ash">
                <p>Webhook URLs after deploy:</p>
                <p className="font-mono text-xs text-void">
                  {plan.webhookUrls.vapi}
                </p>
                <p className="font-mono text-xs text-void">
                  {plan.webhookUrls.twilioSms}
                </p>
              </div>
            </ShellPanel>
          </RevealOnScroll>

          <RevealOnScroll delay={200}>
            <ShellPanel title="Email addresses">
              <ul className="space-y-2 font-sans text-sm">
                {plan.emailSuggestions.map((item) => (
                  <li
                    key={item.address}
                    className="flex justify-between gap-4 border-t border-rule pt-2 first:border-0 first:pt-0"
                  >
                    <span className="font-mono text-void">{item.address}</span>
                    <span className="text-ash">{item.use}</span>
                  </li>
                ))}
              </ul>
            </ShellPanel>
          </RevealOnScroll>
        </div>
      )}
    </OsShell>
  );
}

function HostCard({ label, host }: { label: string; host: string }) {
  return (
    <div className="rounded-md border border-rule bg-white px-4 py-3 transition-shadow hover:shadow-[var(--shadow-soft)]">
      <p className="font-sans text-xs font-semibold tracking-wide text-ash uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm text-void">{host}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const tone =
    tier === "ideal" ? "flare" : tier === "recommended" ? "live" : "neutral";
  return <ShellBadge tone={tone}>{tier}</ShellBadge>;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "owned" || status === "likely_available" ? "live" : "flare";
  return (
    <ShellBadge tone={tone}>{status.replaceAll("_", " ")}</ShellBadge>
  );
}
