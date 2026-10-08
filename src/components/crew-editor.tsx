"use client";

import { useState } from "react";
import { TechScheduleEditor, type TechTimeOff } from "@/components/tech-schedule-editor";
import { skillOptions } from "@/lib/trade-playbooks";
import type { Trade } from "@/lib/trades";

export type CrewTech = {
  id: string;
  name: string;
  phone: string | null;
  skillsJson?: string;
  hoursJson?: string;
  timeOff?: TechTimeOff[];
  hasAppLink?: boolean;
  appLinkAt?: string | null;
};

type Tech = CrewTech;

export function parseSkills(json?: string): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}


function TechAppLink({ tech, onChanged }: { tech: Tech; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function call(method: "GET" | "POST" | "DELETE", body?: unknown) {
    const res = await fetch(`/api/technicians/${tech.id}/app-link`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string | null; sent?: boolean; reason?: string | null; error?: string };
    if (!res.ok) throw new Error(data.error ?? "That didn't work.");
    return data;
  }

  async function run(label: string, work: () => Promise<string>) {
    setBusy(true);
    setNote(null);
    try {
      setNote(await work());
      onChanged();
    } catch (err) {
      setNote(err instanceof Error ? err.message : `${label} didn't work.`);
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run("Sending", async () => {
      const data = await call("POST", { send: true });
      if (data.sent) return `Texted to ${tech.name}.`;
      if (data.url) await navigator.clipboard?.writeText(data.url).catch(() => undefined);
      return data.reason === "no_phone" ? "No mobile on file, so the link was copied instead." : "Texting is off, so the link was copied instead.";
    });

  const copy = () =>
    run("Copying", async () => {
      const data = tech.hasAppLink ? await call("GET") : await call("POST", { send: false });
      const url = data.url ?? (await call("POST", { send: false })).url;
      if (!url) throw new Error("No link to copy.");
      await navigator.clipboard.writeText(url);
      return "Link copied.";
    });

  const turnOff = () => {
    if (!window.confirm(`Turn off ${tech.name}'s app link? It stops working right away.`)) return;
    void run("Turning off", async () => {
      await call("DELETE");
      return "Link turned off.";
    });
  };

  const first = tech.name.split(/\s+/)[0] ?? tech.name;
  const openDay = () =>
    run("Opening", async () => {
      const data = tech.hasAppLink ? await call("GET") : await call("POST", { send: false });
      const url = data.url ?? (await call("POST", { send: false })).url;
      if (!url) throw new Error("No link to open.");
      window.open(url, "_blank", "noopener");
      return `Opened ${first}'s day.`;
    });

  return (
    <div className="dsp-app-link">
      <span className="dsp-skill-note">{tech.hasAppLink ? `${first} has the day on their phone` : `${first} doesn't have the day on their phone yet`}</span>
      <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void send()}>
        {tech.hasAppLink ? `Text ${first} a new link` : `Text ${first} their day`}
      </button>
      <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void openDay()}>
        Open their day
      </button>
      <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={() => void copy()}>
        Copy link
      </button>
      {tech.hasAppLink ? (
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy} onClick={turnOff}>
          Turn off
        </button>
      ) : null}
      {note ? <span className="dsp-skill-note" role="status">{note}</span> : null}
    </div>
  );
}

export function CrewMember({
  tech,
  trade,
  timezone,
  today,
  onSaved,
}: {
  tech: Tech;
  trade: Trade | null;
  timezone: string;
  today: string;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(tech.phone ?? "");
  const [skills, setSkills] = useState<string[]>(() => parseSkills(tech.skillsJson));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = skillOptions(trade);
  const dirty =
    phone.trim() !== (tech.phone ?? "") ||
    JSON.stringify([...skills].sort()) !== JSON.stringify([...parseSkills(tech.skillsJson)].sort());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/technicians/${tech.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() || null, skills }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not save");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dsp-crew-member">
      <form className="dsp-crew-row" onSubmit={save}>
      <div className="dsp-crew-id">
        <span className="dsp-crew-name">{tech.name}</span>
        <input
          className="input dsp-crew-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile for job texts"
          autoComplete="tel"
          aria-label={`${tech.name} mobile`}
        />
      </div>
      <fieldset className="dsp-skills">
        <legend className="sr-only">{tech.name} skills</legend>
        {options.map((opt) => {
          const on = skills.includes(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              className={`dsp-skill ${on ? "is-on" : ""}`}
              aria-pressed={on}
              onClick={() => setSkills((cur) => (on ? cur.filter((s) => s !== opt.key) : [...cur, opt.key]))}
            >
              {opt.label}
            </button>
          );
        })}
        {!skills.length ? <span className="dsp-skill-note">Takes any job</span> : null}
      </fieldset>
      <div className="dsp-crew-save">
        {error ? <span className="dsp-decision-error">{error}</span> : null}
        <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <TechAppLink tech={tech} onChanged={onSaved} />
      </form>
      <TechScheduleEditor tech={tech} timezone={timezone} today={today} onChanged={onSaved} />
    </div>
  );
}

export function AddTechnician({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not add technician");
      setName("");
      setPhone("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add technician");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dsp-add" onSubmit={add}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required aria-label="Technician name" />
      <input
        className="input"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Mobile"
        required
        autoComplete="tel"
        aria-label="Technician mobile"
      />
      <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy}>
        {busy ? "Adding…" : "Add technician"}
      </button>
      {error ? <span className="dsp-decision-error">{error}</span> : null}
    </form>
  );
}
