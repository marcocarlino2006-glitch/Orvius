"use client";

import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellPanel } from "@/components/shell-primitives";
import { industryTerms } from "@/lib/industry-terms";
import { useBusiness } from "@/lib/use-business";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Options = {
  services: string[];
  technicians: { id: string; name: string }[];
  timezone: string;
};

/** Tomorrow at 9am on the shop's clock, as a datetime-local value. */
function tomorrowMorning(timeZone?: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + 86_400_000),
  );
  return `${day}T09:00`;
}

/**
 * The job the owner took themselves — on their own cell, at the counter, from
 * a regular. It lands on the same schedule, with the same tech text and
 * customer confirmation, as the work Orvius books.
 */
function NewJobForm() {
  const router = useRouter();
  const params = useSearchParams();
  const terms = industryTerms(useBusiness().business?.trade);
  const [options, setOptions] = useState<Options | null>(null);
  const [name, setName] = useState(params.get("name") ?? "");
  const [phone, setPhone] = useState(params.get("phone") ?? "");
  const [serviceType, setServiceType] = useState("");
  const [address, setAddress] = useState(params.get("address") ?? "");
  const [when, setWhen] = useState(() => tomorrowMorning());
  const [whenTouched, setWhenTouched] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs/options")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Options | null) => {
        if (data) setOptions(data);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (options?.timezone && !whenTouched) setWhen(tomorrowMorning(options.timezone));
  }, [options?.timezone, whenTouched]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: name.trim() || null, phone, address: address.trim() || null },
          serviceType,
          scheduledLocal: when,
          technicianId: technicianId || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Could not book the ${terms.job}`);
      router.push(`/dashboard/jobs/${data.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not book the ${terms.job}`);
      setSaving(false);
    }
  }

  const crew = options?.technicians ?? [];

  return (
    <ShellPanel title={`Book a ${terms.job}`}>
      <form onSubmit={submit} className="new-job-form space-y-4">
        <div className="new-job-row">
          <label className="block">
            <span className="label">Customer</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input mt-1.5"
              placeholder="Name"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="label">Mobile</span>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input mt-1.5"
              placeholder="(555) 123-4567"
              autoComplete="off"
            />
          </label>
        </div>
        <label className="block">
          <span className="label">What&apos;s the {terms.job}</span>
          <input
            required
            list="new-job-services"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="input mt-1.5"
            placeholder={options?.services[0] ? `e.g. ${options.services[0]}` : undefined}
            autoComplete="off"
          />
          <datalist id="new-job-services">
            {(options?.services ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input mt-1.5"
            placeholder="Street, city"
            autoComplete="off"
          />
        </label>
        <div className="new-job-row">
          <label className="block">
            <span className="label">When</span>
            <input
              type="datetime-local"
              required
              value={when}
              onChange={(e) => {
                setWhenTouched(true);
                setWhen(e.target.value);
              }}
              className="input mt-1.5"
            />
          </label>
          <label className="block">
            <span className="label">Who&apos;s going</span>
            <select
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              className="input mt-1.5"
            >
              <option value="">{crew.length ? "Orvius picks who's free" : "Nobody yet"}</option>
              {crew.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="label">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input mt-1.5"
            placeholder="Gate code, parts to bring…"
          />
        </label>
        <p className="font-sans text-sm text-ash">
          The customer gets a text to confirm the time, and whoever&apos;s going gets the address.
        </p>
        {error ? <p className="font-sans text-sm text-flare-dim">{error}</p> : null}
        <button type="submit" disabled={saving} className={`btn btn-void ${saving ? "btn-loading" : ""}`}>
          {saving ? "Booking…" : `Book ${terms.job}`}
        </button>
      </form>
    </ShellPanel>
  );
}

export default function NewJobPage() {
  const terms = industryTerms(useBusiness().business?.trade);
  return (
    <OsShell title={`New ${terms.job}`}>
      <PlanUpgradeGate module="jobs">
        <Suspense fallback={null}>
          <NewJobForm />
        </Suspense>
      </PlanUpgradeGate>
    </OsShell>
  );
}
