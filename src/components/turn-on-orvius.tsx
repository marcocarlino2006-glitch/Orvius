"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TalkInBrowser } from "@/components/talk-in-browser";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { OrviusMarkSvg } from "@/lib/orvius-mark";
import { company } from "@/lib/company";
import {
  HOURS_PRESETS,
  PERMISSION_LEVELS,
  SETUP_GOALS,
  SETUP_STEPS,
  hoursSummary,
  isSetupTrade,
  parseZipList,
  setupTradeGroups,
  type GoLiveItem,
  type HoursPresetId,
  type PermissionLevel,
  type SetupGoal,
  type SetupScenarioId,
  type SetupStep,
} from "@/lib/setup-flow";
import type { Capability } from "@/lib/capabilities";
import type { SetupTestResult } from "@/lib/setup-sandbox";
import type { Trade } from "@/lib/trades";

type Sandbox = {
  id: string;
  name: string;
  trade: Trade | null;
  step: SetupStep;
  goal: SetupGoal | null;
  team: "solo" | "crew" | null;
  crew: number;
  hours: HoursPresetId | null;
  importedHours: boolean;
  importedHoursSummary: string | null;
  importedAddress: string | null;
  services: { options: string[]; chosen: string[] };
  zips: string[];
  needsServiceArea: boolean;
  calendar: string | null;
  level: PermissionLevel;
  followUps: boolean;
  alwaysToAPerson: string[];
  scenarios: Array<{ id: SetupScenarioId; label: string; expect: string; lines: string[] }>;
  testedAt: string | null;
  test: SetupTestResult | null;
  opening: string;
  activation: { noticeVersion: string; setupVersion: string };
  checklist: GoLiveItem[];
  timezone: string;
  progress: { done: Partial<Record<SetupStep, string>>; allowed: SetupStep[]; missing: Record<SetupStep, SetupStep[]> };
  failures: Array<{ step: SetupStep; at: string; reason: string; attempt: number }>;
  liveDraft: { ownerPhone?: string; areaCode?: string };
  facts: Array<{ label: string; value: string | null; source: "confirmed" | "imported" | "starting_default" | "unknown"; note: string }>;
  capabilities: Capability[] | null;
  providerEffects: Array<{ provider: string; operation: string; status: string; lastError: string | null; updatedAt: string }>;
};

type SetupResponse = {
  live?: boolean;
  sandbox: Sandbox | null;
  error?: string;
};

type Plan = { id: "line" | "pro" | "fleet"; name: string; price: number; tagline: string; featured: boolean; checkoutReady: boolean };

/** What the owner walks. Hours, the first job and permissions start as a normal shop week and change on the desk. */
const OWNER_STEPS = ["business", "test", "live"] as const;

const STEP_TITLES: Record<SetupStep, string> = {
  business: "Your shop",
  goal: "The first job",
  day: "Your day",
  permissions: "What Orvius may do",
  test: "Hear it",
  live: "Pay",
};

function walkStep(value: SetupStep): (typeof OWNER_STEPS)[number] {
  return value === "business" || value === "live" ? value : "test";
}

async function post(body: Record<string, unknown>): Promise<SetupResponse> {
  const res = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as SetupResponse;
  if (!res.ok) throw new Error(json.error || "That didn't save. Try again.");
  return json;
}

export function TurnOnOrvius({
  checkoutOpen,
  initialStep,
  canceled,
}: {
  checkoutOpen: boolean;
  initialStep?: string | null;
  canceled?: boolean;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [step, setStep] = useState<SetupStep>("business");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = useCallback((json: SetupResponse, next?: SetupStep) => {
    setSandbox(json.sandbox);
    if (next) setStep(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resume = await fetch("/api/onboarding?resume=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (resume?.checkoutSessionId) {
        router.replace(`/dashboard/onboarding?session_id=${encodeURIComponent(resume.checkoutSessionId)}`);
        return;
      }
      const res = await fetch("/api/setup", { cache: "no-store" });
      const json = (await res.json().catch(() => ({ sandbox: null }))) as SetupResponse;
      if (cancelled) return;
      if (json.live) {
        router.replace("/dashboard");
        return;
      }
      setSandbox(json.sandbox);
      const wanted = SETUP_STEPS.find((s) => s === initialStep && (!json.sandbox || json.sandbox.progress.allowed.includes(s)));
      setStep(json.sandbox ? walkStep(wanted ?? json.sandbox.step) : "business");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialStep, router]);

  const run = useCallback(
    async (body: Record<string, unknown>, next?: SetupStep) => {
      setBusy(true);
      setError("");
      try {
        apply(await post(body), next);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "That didn't save. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const index = OWNER_STEPS.indexOf(walkStep(step));
  const back = index > 0 && sandbox ? OWNER_STEPS[index - 1] : null;

  const go = (next: SetupStep) => {
    setError("");
    if (sandbox && !sandbox.progress.allowed.includes(next)) {
      const missing = sandbox.progress.missing[next] ?? [];
      setError(`Finish ${missing.map((m) => STEP_TITLES[m].toLowerCase()).join(" and ")} first.`);
      return;
    }
    const previous = step;
    setStep(next);
    if (sandbox)
      void post({ action: "step", step: next }).catch((err) => {
        setStep(previous);
        setError(err instanceof Error ? err.message : "That didn't save. Try again.");
      });
    window.scrollTo({ top: 0 });
  };

  if (!loaded) {
    return (
      <main className="ton" aria-busy="true">
        <TopBar index={0} />
        <section className="ton-stage">
          <p className="ton-lead">Opening setup…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ton">
      <TopBar index={index} done={sandbox?.progress.done ?? {}} onBack={back ? () => go(back) : undefined} testMode={Boolean(sandbox)} />
      <section className="ton-stage" key={step}>
        {step === "business" ? (
          <BusinessStep
            sandbox={sandbox}
            busy={busy}
            onSave={(name, trade, found) =>
              run({ action: "start", name, trade, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(found ? { found } : {}) }, "test")
            }
          />
        ) : null}
        {step === "goal" && sandbox ? (
          <GoalStep sandbox={sandbox} busy={busy} onSave={(goal) => run({ action: "goal", goal }, "day")} />
        ) : null}
        {step === "day" && sandbox ? <DayStep sandbox={sandbox} busy={busy} onSave={(body) => run({ action: "day", ...body }, "permissions")} /> : null}
        {step === "permissions" && sandbox ? (
          <PermissionsStep sandbox={sandbox} busy={busy} onSave={(level, followUps) => run({ action: "permissions", level, followUps }, "test")} />
        ) : null}
        {step === "test" && sandbox ? <TestStep sandbox={sandbox} onNext={() => go("live")} /> : null}
        {step === "live" && sandbox ? (
          <LiveStep sandbox={sandbox} checkoutOpen={checkoutOpen} canceled={Boolean(canceled)} />
        ) : null}
        {error ? (
          <p className="ton-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function TopBar({
  index,
  done = {},
  onBack,
  testMode,
}: {
  index: number;
  done?: Partial<Record<SetupStep, string>>;
  onBack?: () => void;
  testMode?: boolean;
}) {
  return (
    <header className="ton-top">
      <div className="ton-top-row">
        {onBack ? (
          <button type="button" className="ton-back" onClick={onBack}>
            Back
          </button>
        ) : (
          <span className="ton-brand">
            <OrviusMarkSvg size={20} />
            {company.productName}
          </span>
        )}
        <span className="ton-count">
          {index + 1} of {OWNER_STEPS.length} · {STEP_TITLES[OWNER_STEPS[index]]}
        </span>
        {testMode ? <span className="ton-pill">Test mode</span> : <span />}
      </div>
      <ol className="ton-progress" aria-label="Setup progress">
        {OWNER_STEPS.map((s, i) => (
          <li key={s} className={done[s] || i === index ? "is-done" : ""} aria-current={i === index ? "step" : undefined}>
            <span className="sr-only">
              {STEP_TITLES[s]}
              {done[s] ? ", saved" : ", not saved yet"}
            </span>
          </li>
        ))}
      </ol>
    </header>
  );
}

function Heading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="ton-head">
      <h1 className="ton-title">{title}</h1>
      <p className="ton-lead">{lead}</p>
    </div>
  );
}

function Primary({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="ton-actions">
      <button type="button" className="ton-primary" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    </div>
  );
}

/* ── 1. What kind of business ─────────────────────────────────────────── */

type FoundShop = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  hoursJson: string | null;
  trade: Trade | null;
  source: "website" | "google";
};

type Claimed = { address?: string; hoursJson?: string; source: "website" | "google" };

function BusinessStep({
  sandbox,
  busy,
  onSave,
}: {
  sandbox: Sandbox | null;
  busy: boolean;
  onSave: (name: string, trade: Trade, found?: Claimed) => void;
}) {
  const [trade, setTrade] = useState<Trade | null>(sandbox?.trade ?? null);
  const [name, setName] = useState(sandbox?.name ?? "");
  const groups = useMemo(() => setupTradeGroups(), []);
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [results, setResults] = useState<FoundShop[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Claimed | null>(null);

  async function findShop() {
    const q = query.trim();
    if (q.length < 3 || looking) return;
    setLooking(true);
    setNote(null);
    setResults(null);
    try {
      const res = await fetch(`/api/onboarding/lookup?q=${encodeURIComponent(q)}`);
      const json = (await res.json().catch(() => ({}))) as { found?: FoundShop[]; reason?: string };
      const found = json.found ?? [];
      if (found.length === 1) pick(found[0]!);
      else if (found.length > 1) setResults(found);
      else setNote(json.reason ?? "No match. Fill it in below — it takes a minute.");
    } catch {
      setNote("Couldn't look that up. Fill it in below — it takes a minute.");
    } finally {
      setLooking(false);
    }
  }

  function pick(shop: FoundShop) {
    setName(shop.name);
    if (shop.trade && isSetupTrade(shop.trade)) setTrade(shop.trade);
    setClaimed({
      ...(shop.address ? { address: shop.address } : {}),
      ...(shop.hoursJson ? { hoursJson: shop.hoursJson } : {}),
      source: shop.source,
    });
    setResults(null);
    const bits = [shop.address, hoursSummary(shop.hoursJson)].filter(Boolean);
    setNote(bits.length ? `Found it: ${bits.join(" · ")}. Loaded below — check it and continue.` : "Found it. Loaded below — check it and continue.");
  }

  const save = () => {
    if (trade && name.trim().length >= 2) onSave(name.trim(), trade, claimed ?? undefined);
  };

  return (
    <>
      <Heading
        title="Name your shop."
        lead="Find the listing, or type the name. Next you hear it answer. No card yet."
      />
      <fieldset className="ton-group">
        <legend className="ton-group-title">Start with your shop as customers find it</legend>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void findShop();
          }}
        >
          <label className="ton-field">
            <span className="ton-label">Your website or Google listing</span>
            <input
              className="ton-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="raysheating.com or Ray's Heating, Austin"
              autoComplete="url"
              maxLength={200}
            />
          </label>
          <Primary disabled={query.trim().length < 3 || looking} onClick={() => void findShop()}>
            {looking ? "Looking…" : "Find my shop"}
          </Primary>
        </form>
        {results ? (
          <div className="ton-cards" role="radiogroup" aria-label="Which one is your shop?">
            {results.map((shop) => (
              <button key={`${shop.name}-${shop.address}`} type="button" className="ton-card" onClick={() => pick(shop)}>
                <span>{shop.name}</span>
                {shop.address ? <span className="ton-note">{shop.address}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {note ? (
          <p className="ton-note" aria-live="polite">
            {note}
          </p>
        ) : (
          <p className="ton-note">We fill in your name, address and hours so you confirm instead of typing. Or just pick below.</p>
        )}
      </fieldset>
      {groups.map((group) => (
        <fieldset key={group.title} className="ton-group">
          <legend className="ton-group-title">{group.title}</legend>
          <div className="ton-chips" role="radiogroup" aria-label={group.title}>
            {group.trades.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={trade === item}
                className={`ton-chip ${trade === item ? "is-on" : ""}`}
                onClick={() => setTrade(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="ton-note">
        Orvius launches for heating &amp; cooling, plumbing and electrical. Another kind of business?{" "}
        <Link href="/pilot#waitlist">Join the waitlist</Link> and we&apos;ll tell you when yours is ready.
      </p>
      {trade ? (
        <label className="ton-field">
          <span className="ton-label">What&apos;s it called?</span>
          <input
            className="ton-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summit Heating & Air"
            autoFocus
            maxLength={80}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim().length >= 2) save();
            }}
          />
        </label>
      ) : null}
      <Primary disabled={!trade || name.trim().length < 2 || busy} onClick={save}>
        {busy ? "Saving…" : "Hear it answer"}
      </Primary>
      <p className="ton-fine">No card. Nothing answers real calls until you say so.</p>
    </>
  );
}

/* ── 2. First goal ─────────────────────────────────────────────────────── */

function GoalStep({ sandbox, busy, onSave }: { sandbox: Sandbox; busy: boolean; onSave: (goal: SetupGoal) => void }) {
  const [goal, setGoal] = useState<SetupGoal | null>(sandbox.goal);
  return (
    <>
      <Heading title="What should Orvius take off your plate first?" lead="Pick one to start. You can turn on the rest any time." />
      <div className="ton-cards" role="radiogroup" aria-label="First goal">
        {SETUP_GOALS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={goal === item.id}
            className={`ton-card ${goal === item.id ? "is-on" : ""}`}
            onClick={() => setGoal(item.id)}
          >
            <span className="ton-card-title">{item.title}</span>
            <span className="ton-card-line">{item.line}</span>
          </button>
        ))}
      </div>
      <Primary disabled={!goal || busy} onClick={() => goal && onSave(goal)}>
        {busy ? "Saving…" : "Continue"}
      </Primary>
    </>
  );
}

/* ── 3. How the day works ──────────────────────────────────────────────── */

function DayStep({
  sandbox,
  busy,
  onSave,
}: {
  sandbox: Sandbox;
  busy: boolean;
  onSave: (body: {
    hours: HoursPresetId | "listing";
    services: string[];
    zips?: string[];
    team?: "solo" | "crew";
    crew?: Array<{ name: string; phone: string }>;
  }) => void;
}) {
  const [hours, setHours] = useState<HoursPresetId | "listing">(sandbox.importedHours ? "listing" : (sandbox.hours ?? "weekdays"));
  const [serviceOptions, setServiceOptions] = useState(sandbox.services.options);
  const [services, setServices] = useState<string[]>(sandbox.services.chosen.length ? sandbox.services.chosen : sandbox.services.options);
  const [extra, setExtra] = useState("");
  function addExtra() {
    const name = extra.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!name) return;
    if (!serviceOptions.some((o) => o.toLowerCase() === name.toLowerCase())) setServiceOptions([...serviceOptions, name]);
    if (!services.some((o) => o.toLowerCase() === name.toLowerCase())) setServices([...services, name]);
    setExtra("");
  }
  const [zips, setZips] = useState(sandbox.zips.join(", "));
  const [team, setTeam] = useState<"solo" | "crew">(sandbox.team ?? "solo");
  const [crew, setCrew] = useState([{ name: "", phone: "" }]);
  const [calUrl, setCalUrl] = useState("");
  const [calendar, setCalendar] = useState<string | null>(sandbox.calendar);
  const [calBusy, setCalBusy] = useState(false);
  const [calError, setCalError] = useState("");
  const zipList = parseZipList(zips);

  async function connectCalendar() {
    setCalBusy(true);
    setCalError("");
    try {
      const res = await fetch("/api/account/busy-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: calUrl.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "That calendar address didn't work.");
      setCalendar(json.source ?? "Your calendar");
      setCalUrl("");
    } catch (err) {
      setCalError(err instanceof Error ? err.message : "That calendar address didn't work.");
    } finally {
      setCalBusy(false);
    }
  }

  return (
    <>
      <Heading title="How does your day work?" lead="Orvius only offers times inside these hours, and won't offer one your calendar says you're busy." />

      <fieldset className="ton-group">
        <legend className="ton-group-title">Your hours</legend>
        <div className="ton-chips" role="radiogroup" aria-label="Your hours">
          {sandbox.importedHours ? (
            <button
              type="button"
              role="radio"
              aria-checked={hours === "listing"}
              className={`ton-chip ${hours === "listing" ? "is-on" : ""}`}
              onClick={() => setHours("listing")}
            >
              From your listing{sandbox.importedHoursSummary ? ` · ${sandbox.importedHoursSummary}` : ""}
            </button>
          ) : null}
          {HOURS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={hours === preset.id}
              className={`ton-chip ${hours === preset.id ? "is-on" : ""}`}
              onClick={() => setHours(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="ton-note">
          {sandbox.importedHours
            ? "These came from your listing. Keep them, or pick a preset to replace them — exact hours can be set in Settings later."
            : "Different every day? Pick the closest; set exact hours in Settings later."}
        </p>
      </fieldset>

      <fieldset className="ton-group">
        <legend className="ton-group-title">The work you take</legend>
        <div className="ton-chips" role="group" aria-label="The work you take">
          {serviceOptions.map((name) => {
            const on = services.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                className={`ton-chip ${on ? "is-on" : ""}`}
                onClick={() => setServices(on ? services.filter((s) => s !== name) : [...services, name])}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="ton-inline">
          <input
            className="ton-input"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExtra();
              }
            }}
            placeholder="Something else you do"
            aria-label="Add a kind of work"
            maxLength={60}
          />
          <button type="button" className="ton-secondary" disabled={!extra.trim() || services.length >= 12} onClick={addExtra}>
            Add
          </button>
        </div>
        <p className="ton-note">
          {services.length
            ? "Orvius tells callers this is the work you do. Calls about anything else still land in Command for you to decide."
            : "Pick at least one."}
        </p>
      </fieldset>

      <fieldset className="ton-group">
        <legend className="ton-group-title">
          Your calendar <span className="ton-optional">optional</span>
        </legend>
        {calendar ? (
          <p className="ton-ok">Connected: {calendar}. Busy times there are never offered.</p>
        ) : (
          <>
            <div className="ton-inline">
              <input
                className="ton-input"
                value={calUrl}
                onChange={(e) => setCalUrl(e.target.value)}
                placeholder="Paste your Google, Apple or Outlook calendar's secret iCal address"
                aria-label="Calendar iCal address"
              />
              <button type="button" className="ton-secondary" disabled={calUrl.trim().length < 8 || calBusy} onClick={() => void connectCalendar()}>
                {calBusy ? "Checking…" : "Connect"}
              </button>
            </div>
            <p className="ton-note">
              Orvius only reads when you&apos;re busy, never what the events are.{" "}
              <Link href="/help/calendar" target="_blank">
                Where to find it
              </Link>
            </p>
            {calError ? <p className="ton-error">{calError}</p> : null}
          </>
        )}
      </fieldset>

      {sandbox.needsServiceArea ? (
        <>
          <fieldset className="ton-group">
            <legend className="ton-group-title">
              Where you work <span className="ton-optional">optional</span>
            </legend>
            <input
              className="ton-input"
              value={zips}
              onChange={(e) => setZips(e.target.value)}
              placeholder="ZIP codes you cover, like 60201, 60202"
              inputMode="numeric"
              aria-label="Service ZIP codes"
            />
            <p className="ton-note">
              {zipList.length
                ? `${zipList.length} ZIP${zipList.length === 1 ? "" : "s"}. Calls from anywhere else are held for you.`
                : "Leave empty to take calls from anywhere."}
            </p>
          </fieldset>

          <fieldset className="ton-group">
            <legend className="ton-group-title">Who goes out on jobs?</legend>
            <div className="ton-chips" role="radiogroup" aria-label="Team">
              {(["solo", "crew"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={team === value}
                  className={`ton-chip ${team === value ? "is-on" : ""}`}
                  onClick={() => setTeam(value)}
                >
                  {value === "solo" ? "Just me" : "A crew"}
                </button>
              ))}
            </div>
            {team === "crew" ? (
              <div className="ton-crew">
                {sandbox.crew > 0 ? <p className="ton-ok">{sandbox.crew} on your team already.</p> : null}
                {crew.map((person, i) => (
                  <div key={i} className="ton-inline">
                    <input
                      className="ton-input"
                      value={person.name}
                      placeholder="Name"
                      aria-label={`Teammate ${i + 1} name`}
                      onChange={(e) => setCrew(crew.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                    />
                    <input
                      className="ton-input"
                      value={person.phone}
                      placeholder="Mobile"
                      inputMode="tel"
                      aria-label={`Teammate ${i + 1} mobile`}
                      onChange={(e) => setCrew(crew.map((p, j) => (j === i ? { ...p, phone: e.target.value } : p)))}
                    />
                  </div>
                ))}
                {crew.length < 6 ? (
                  <button type="button" className="ton-link" onClick={() => setCrew([...crew, { name: "", phone: "" }])}>
                    Add another
                  </button>
                ) : null}
                <p className="ton-note">Nobody on your team gets a real text in test mode.</p>
              </div>
            ) : null}
          </fieldset>
        </>
      ) : null}

      <Primary
        disabled={busy || services.length === 0}
        onClick={() =>
          onSave({
            hours,
            services,
            ...(sandbox.needsServiceArea
              ? {
                  zips: zipList,
                  team,
                  crew: crew.filter((p) => p.name.trim() && p.phone.replace(/\D/g, "").length >= 10),
                }
              : {}),
          })
        }
      >
        {busy ? "Saving…" : "Continue"}
      </Primary>
    </>
  );
}

/* ── 4. What Orvius may do without asking ──────────────────────────────── */

function PermissionsStep({
  sandbox,
  busy,
  onSave,
}: {
  sandbox: Sandbox;
  busy: boolean;
  onSave: (level: PermissionLevel, followUps: boolean) => void;
}) {
  const [level, setLevel] = useState<PermissionLevel>(sandbox.level);
  const [followUps, setFollowUps] = useState(sandbox.followUps || sandbox.goal === "follow_ups");
  return (
    <>
      <Heading title="What can Orvius do without asking?" lead="Start careful. You can give it more room once you've seen it work." />

      <div className="ton-cards ton-cards--stack">
        <div className="ton-card is-fixed">
          <span className="ton-card-title">
            Capture every request <span className="ton-tag">Always on</span>
          </span>
          <span className="ton-card-line">Name, number, what they need and where. Every call lands in Command, booked or not.</span>
        </div>
      </div>

      <div className="ton-cards ton-cards--stack" role="radiogroup" aria-label="Booking">
        {PERMISSION_LEVELS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={level === item.id}
            className={`ton-card ${level === item.id ? "is-on" : ""}`}
            onClick={() => setLevel(item.id)}
          >
            <span className="ton-card-title">{item.title}</span>
            <span className="ton-card-line">{item.line}</span>
          </button>
        ))}
      </div>

      <label className="ton-check">
        <input type="checkbox" checked={followUps} onChange={(e) => setFollowUps(e.target.checked)} />
        <span>Text callers who didn&apos;t book, once, so the job isn&apos;t lost.</span>
      </label>

      <div className="ton-person">
        <p className="ton-person-title">Always goes to a person</p>
        <ul>
          {sandbox.alwaysToAPerson.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="ton-note">Orvius tells the caller someone will call back, and alerts you right away.</p>
      </div>

      <Primary disabled={busy} onClick={() => onSave(level, followUps)}>
        {busy ? "Saving…" : "Continue"}
      </Primary>
    </>
  );
}

/* ── 5. See your business run ──────────────────────────────────────────── */

function TestStep({ sandbox, onNext }: { sandbox: Sandbox; onNext: () => void }) {
  return (
    <>
      <Heading
        title="Hear your shop answer."
        lead="Talk to it as a customer would. It answers as your business. Weekdays 8 to 6, Saturday 9 to 2. It takes the request until you set how far apart jobs sit, on the desk. No one else is called, and nothing is charged."
      />

      <TalkInBrowser
        personal
        phoneHref={demoLineHref()}
        phoneDisplay={DEMO_LINE_DISPLAY}
        initial={{ name: sandbox.name, trade: sandbox.trade }}
      />

      <Primary onClick={onNext}>Continue to pay</Primary>
    </>
  );
}


const FACT_SOURCE: Record<Sandbox["facts"][number]["source"], string> = {
  confirmed: "You confirmed",
  imported: "Read from your device",
  starting_default: "Starting default, not confirmed",
  unknown: "Not set",
};

const CAP_STATE: Record<Capability["state"], string> = { ready: "On", pending: "Waiting", off: "Off" };

/** What Orvius knows and where each fact came from, then what will run on day one and what waits. */
function SetupFacts({ sandbox }: { sandbox: Sandbox }) {
  return (
    <>
      <details className="ton-group">
        <summary className="ton-group-title">What Orvius knows about {sandbox.name}</summary>
        <ul className="ton-checklist">
          {sandbox.facts.map((fact) => (
            <li key={fact.label} className={fact.source === "confirmed" ? "is-live" : "is-not_connected"}>
              <span className="ton-check-state">{FACT_SOURCE[fact.source]}</span>
              <span className="ton-check-label">{fact.label}</span>
              <span className="ton-check-detail">{fact.note}</span>
            </li>
          ))}
        </ul>
      </details>
      {sandbox.capabilities ? (
        <div className="ton-group">
          <p className="ton-group-title">What runs once you&apos;re live</p>
          <ul className="ton-checklist">
            {sandbox.capabilities
              .filter((c) => c.id !== "voice")
              .map((cap) => (
                <li key={cap.id} className={cap.state === "pending" ? "is-needs_approval" : cap.state === "off" ? "is-not_connected" : "is-live"}>
                  <span className="ton-check-state">{cap.simulated ? "Simulated now" : CAP_STATE[cap.state]}</span>
                  <span className="ton-check-label">{cap.label}</span>
                  <span className="ton-check-detail">{cap.state === "ready" ? cap.detail : (cap.meanwhile ?? cap.detail)}</span>
                </li>
              ))}
          </ul>
          <p className="ton-fine">Texting to customers needs carrier approval after you go live. Until then customer texts are held, not sent.</p>
        </div>
      ) : null}
      {sandbox.providerEffects.length ? (
        <p className="ton-error" role="status">
          A setup step with {sandbox.providerEffects[0].provider === "stripe" ? "Stripe" : "the phone provider"} didn&apos;t confirm (
          {sandbox.providerEffects[0].status}). It won&apos;t be repeated blindly; email support@orvius.im if it doesn&apos;t clear in a few minutes.
        </p>
      ) : null}
    </>
  );
}

const STATE_LABEL: Record<GoLiveItem["state"], string> = {
  live: "Live",
  not_connected: "Not connected",
  needs_approval: "Needs approval",
};

function LiveStep({
  sandbox,
  checkoutOpen,
  canceled,
}: {
  sandbox: Sandbox;
  checkoutOpen: boolean;
  canceled: boolean;
}) {
  const [ownerPhone, setOwnerPhone] = useState(sandbox.liveDraft.ownerPhone ?? "");
  const [areaCode, setAreaCode] = useState(sandbox.liveDraft.areaCode ?? "");
  const [draftNote, setDraftNote] = useState("");
  const saveDraft = () =>
    void post({ action: "draft", ownerPhone: ownerPhone.trim(), areaCode })
      .then(() => setDraftNote(""))
      .catch(() => setDraftNote("Couldn't save this on our side yet. It's still here on this screen."));
  const [recording, setRecording] = useState(false);
  const [approve, setApprove] = useState(false);
  const [terms, setTerms] = useState(false);
  const [sms, setSms] = useState(false);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planId, setPlanId] = useState<Plan["id"]>("pro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!checkoutOpen) return;
    fetch("/api/billing/checkout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { plans?: Plan[] } | null) => {
        const ready = (json?.plans ?? []).filter((p) => p.checkoutReady);
        setPlans(ready);
        if (ready.length && !ready.some((p) => p.id === "pro")) setPlanId(ready[0].id);
      })
      .catch(() => setPlans([]));
  }, [checkoutOpen]);

  const checklist = sandbox.checklist.map((item) => {
    if (item.id === "recording" && recording) return { ...item, state: "live" as const, detail: "Approved. Callers hear the notice first." };
    if (item.id === "messaging" && ownerPhone.replace(/\D/g, "").length >= 10 && sms)
      return { ...item, state: "needs_approval" as const, detail: "Alerts go to this mobile once you go live." };
    return item;
  });

  const canGo =
    checkoutOpen &&
    Boolean(plans?.length) &&
    ownerPhone.replace(/\D/g, "").length >= 10 &&
    (!areaCode || /^[2-9]\d{2}$/.test(areaCode)) &&
    recording &&
    approve &&
    terms &&
    sms &&
    !busy;

  async function goLive() {
    if (!sandbox.trade) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          interval: "month",
          shop: {
            name: sandbox.name,
            trade: sandbox.trade,
            ownerPhone: ownerPhone.trim(),
            ...(areaCode ? { areaCode } : {}),
            timezone: sandbox.timezone,
            acceptedTerms: true,
            acceptedSms: true,
          },
          activation: { recording: true, approved: true, ...sandbox.activation },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.code === "setup_incomplete" && json.setupUrl) {
        setError(json.error);
        setBusy(false);
        return;
      }
      if (!res.ok || !json.url) throw new Error(json.error || "Checkout didn't open. Try again.");
      window.location.assign(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout didn't open. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        title="Pay."
        lead="This puts your shop on its own line. Weekdays 8 to 6, Saturday 9 to 2. It takes the request until you set how far apart jobs sit. Change both on the desk."
      />
      {canceled ? <p className="ton-note" role="status">Checkout closed before payment. Nothing was charged and your setup is saved.</p> : null}

      <SetupFacts sandbox={sandbox} />

      <ul className="ton-checklist">
        {checklist.map((item) => (
          <li key={item.id} className={`is-${item.state}`}>
            <span className="ton-check-state">{STATE_LABEL[item.state]}</span>
            <span className="ton-check-label">{item.label}</span>
            <span className="ton-check-detail">{item.detail}</span>
          </li>
        ))}
      </ul>

      <fieldset className="ton-group">
        <legend className="ton-group-title">Recording and consent</legend>
        <blockquote className="ton-quote">&ldquo;{sandbox.opening}&rdquo;</blockquote>
        <label className="ton-check">
          <input type="checkbox" checked={recording} onChange={(e) => setRecording(e.target.checked)} />
          <span>Callers hear this before anything else. I approve it.</span>
        </label>
      </fieldset>

      {!checkoutOpen ? (
        <div className="ton-person">
          <p className="ton-person-title">We turn on new businesses with you, for now.</p>
          <p className="ton-note">
            Your setup and test are saved. Book a short call and we&apos;ll connect your line together, using exactly what you set here.
          </p>
          <div className="ton-actions ton-actions--split">
            <Link href="/dashboard" className="ton-secondary">
              Open Command
            </Link>
            <Link href="/pilot" className="ton-primary">
              Book a call
            </Link>
          </div>
        </div>
      ) : (
        <>
          <fieldset className="ton-group">
            <legend className="ton-group-title">Texts to you</legend>
            <div className="ton-inline">
              <input
                className="ton-input"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                onBlur={saveDraft}
                placeholder="Your mobile"
                inputMode="tel"
                aria-label="Your mobile"
              />
              <input
                className="ton-input ton-input--short"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                onBlur={saveDraft}
                placeholder="Area code"
                inputMode="numeric"
                aria-label="Area code for your Orvius number"
              />
            </div>
            {draftNote ? <p className="ton-note" role="status">{draftNote}</p> : null}
            <p className="ton-note">
              Alerts and safety calls go to this mobile. You get a local Orvius number in this area code. Right after, we
              walk you through connecting your business number: you keep it, and you choose which calls Orvius takes.
            </p>
          </fieldset>

          {plans && plans.length > 1 ? (
            <fieldset className="ton-group">
              <legend className="ton-group-title">Your plan</legend>
              <div className="ton-chips" role="radiogroup" aria-label="Plan">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={planId === plan.id}
                    className={`ton-chip ${planId === plan.id ? "is-on" : ""}`}
                    onClick={() => setPlanId(plan.id)}
                  >
                    {plan.name} · ${plan.price}/mo
                  </button>
                ))}
              </div>
              <p className="ton-note">
                <Link href="/pricing" target="_blank">
                  Compare plans
                </Link>
              </p>
            </fieldset>
          ) : null}

          <div className="ton-consent">
            <label className="ton-check">
              <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
              <span>Turn Orvius on for {sandbox.name}. It may answer real callers and take the request.</span>
            </label>
            <label className="ton-check">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                I agree to the <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy</Link> and{" "}
                <Link href="/refunds">Refunds</Link>.
              </span>
            </label>
            <label className="ton-check">
              <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
              <span>
                I consent to transactional SMS alerts from {company.smsProgramName} at this number.{" "}
                <Link href="/sms-terms">SMS Terms</Link>.
              </span>
            </label>
          </div>

          {plans && plans.length === 0 ? (
            <p className="ton-error">Card checkout isn&apos;t open right now. Your setup is saved. Email support@orvius.im and we&apos;ll turn it on with you.</p>
          ) : null}
          {error ? (
            <p className="ton-error" role="alert">
              {error}
            </p>
          ) : null}

          <Primary disabled={!canGo} onClick={() => void goLive()}>
            {busy ? "Opening checkout…" : "Approve and continue to checkout"}
          </Primary>
          <p className="ton-fine">Your test records are cleared when you go live. Your settings carry over.</p>
        </>
      )}
    </>
  );
}
