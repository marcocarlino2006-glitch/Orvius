"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PublicShopFallback, type ShopContact } from "@/components/public-shop-fallback";
import { sendWrite } from "@/lib/client-write";
import { CHECKING, checkRecord, newOperationKey, runCheckedWrite, type CheckedResult, type ReadBackAnswer } from "@/lib/checked-write";
import "@/app/public-field.css";
import "./book.css";

type Slot = { at: string; label: string };
type Info = {
  business: { name: string; timezone: string | null; phone: string | null };
  services: string[];
  service: string | null;
  slots: Slot[];
};
type Done = { label: string; confirmTextSent: boolean };
type Outcome = Done | { received: string };

/** Only a reply that names the booked time counts as booked. */
function asDone(data: unknown): Done | null {
  const d = data as { ok?: unknown; label?: unknown; confirmTextSent?: unknown } | null;
  if (d?.ok !== true || typeof d.label !== "string" || !d.label) return null;
  return { label: d.label, confirmTextSent: d.confirmTextSent === true };
}

/** One key per service and time on this page, kept across a reload, so pressing Book again is the same booking. */
function attemptKey(slug: string, service: string, at: string) {
  const name = `orvius-book:${slug}:${service}:${at}`;
  try {
    const saved = sessionStorage.getItem(name);
    if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
    const key = newOperationKey();
    sessionStorage.setItem(name, key);
    return key;
  } catch {
    return newOperationKey();
  }
}

function dayKey(iso: string, timezone: string | null) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: timezone ?? undefined,
  });
}

function timeOnly(iso: string, timezone: string | null) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone ?? undefined,
  });
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : raw;
}

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState<{ contact: ShopContact } | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "", website: "", marketingOptIn: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [received, setReceived] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /** A booking whose outcome Orvius couldn't confirm: Book becomes "Check again" until the record answers. */
  const [pending, setPending] = useState<string | null>(null);

  const load = async (nextService: string | null) => {
    const qs = nextService ? `?${new URLSearchParams({ service: nextService })}` : "";
    const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}${qs}`);
    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      setMissing({ contact: body?.business ?? null });
      return null;
    }
    if (!res.ok) {
      setError("Booking didn't load. Refresh to try again.");
      return null;
    }
    const data: Info = await res.json();
    setInfo(data);
    return data;
  };

  useEffect(() => {
    void load(null).then((data) => {
      if (data?.services.length === 1) void pickService(data.services[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const pickService = async (name: string) => {
    setService(name);
    setSlot(null);
    setError(null);
    setSlotsLoading(true);
    await load(name);
    setSlotsLoading(false);
  };

  const tz = info?.business.timezone ?? null;
  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const s of info?.service ? info.slots : []) {
      const key = dayKey(s.at, tz);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()];
  }, [info, tz]);

  const bookUrl = `/api/public/book/${encodeURIComponent(slug)}`;

  const readBooking = async (key: string): Promise<ReadBackAnswer<Outcome>> => {
    const res = await fetch(`${bookUrl}?${new URLSearchParams({ booking: key })}`, { cache: "no-store" });
    if (!res.ok) return null;
    const found = ((await res.json().catch(() => null)) as { booking?: unknown } | null)?.booking;
    if (asDone(found)) return asDone(found);
    const reason = (found as { reason?: unknown } | null)?.reason;
    if (reason === "none") return "absent";
    if (reason === "received") return { received: String((found as { message?: unknown }).message ?? "") };
    return null;
  };

  const settle = (result: CheckedResult<Outcome>, key: string) => {
    if (result.kind === "confirmed") {
      if ("received" in result.value) setReceived(result.value.received || "The business has your request and will contact you to set a time.");
      else setDone(result.value);
      return;
    }
    if (result.kind === "unknown") {
      setPending(key);
      setError(result.message);
      return;
    }
    setPending(null);
    setError(result.message);
  };

  const submit = async () => {
    if (!service || !slot || busy) return;
    if (pending) return void checkAgain();
    const key = attemptKey(slug, service, slot.at);
    setBusy(true);
    setError(null);
    try {
      const result = await runCheckedWrite<Outcome>({
        send: () => sendWrite(bookUrl, "POST", { serviceType: service, at: slot.at, ...form, bookingKey: key }),
        accept: asDone,
        readBack: () => readBooking(key),
        onChecking: () => setChecking(true),
      });
      if (result.kind === "failed" && result.reason === "received") {
        setReceived(result.message);
        return;
      }
      settle(result, key);
      if (result.kind === "failed" && result.reason === "slot_taken") {
        setSlot(null);
        await load(service);
      }
    } finally {
      setChecking(false);
      setBusy(false);
    }
  };

  const checkAgain = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setChecking(true);
    setError(null);
    try {
      settle(await checkRecord(() => readBooking(pending)), pending);
    } finally {
      setChecking(false);
      setBusy(false);
    }
  };

  if (missing) {
    return <PublicShopFallback title="Online booking isn't available" contact={missing.contact} ask="to book" />;
  }

  if (!info) {
    return (
      <main className="pf pf--center" aria-busy="true">
        <p className="pf-muted">Loading open times…</p>
      </main>
    );
  }

  const phone = info.business.phone;

  if (done) {
    return (
      <main className="pf pf--center">
        <div className="pf-head">
          <p className="pf-kicker">{info.business.name}</p>
          <h1 className="pf-title">You&apos;re booked</h1>
          <p className="pf-sub">
            {service} · {done.label}
          </p>
        </div>
        <div className="pf-card pf-done">
          <p className="pf-muted">
            {done.confirmTextSent
              ? `We just texted you a link to confirm. Tap it so we know you're coming. Need to change it? Reply to the text${phone ? ` or call ${formatPhone(phone)}` : ""}.`
              : `We'll reach out to confirm.${phone ? ` Need to change it? Call ${formatPhone(phone)}.` : ""}`}
          </p>
        </div>
      </main>
    );
  }

  if (received) {
    return (
      <main className="pf pf--center">
        <div className="pf-head">
          <p className="pf-kicker">{info.business.name}</p>
          <h1 className="pf-title">Request received</h1>
          <p className="pf-sub">No time is held yet.</p>
        </div>
        <div className="pf-card pf-done">
          <p className="pf-muted">
            {received}
            {phone ? ` Or call ${formatPhone(phone)}.` : ""}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="pf bk">
      <div className="pf-head">
        <p className="pf-kicker">{slot ? info.business.name : "Book online"}</p>
        <h1 className="pf-title">{slot ? slot.label : info.business.name}</h1>
        {phone ? (
          <p className="pf-sub">
            Rather talk? <a href={`tel:${phone}`}>{formatPhone(phone)}</a>
          </p>
        ) : null}
      </div>

      <section className="pf-card" aria-labelledby="bk-service">
        <h2 id="bk-service" className="pf-h2">
          What do you need?
        </h2>
        <div className="bk-chips">
          {info.services.map((name) => (
            <button
              key={name}
              type="button"
              className={`bk-chip ${service === name ? "is-on" : ""}`}
              aria-pressed={service === name}
              disabled={Boolean(pending)}
              onClick={() => void pickService(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {service ? (
        <section className="pf-card" aria-labelledby="bk-time">
          <h2 id="bk-time" className="pf-h2">
            When
          </h2>
          {slotsLoading ? (
            <p className="pf-muted">Finding open times…</p>
          ) : !days.length ? (
            <p className="pf-muted">
              Nothing open online in the next two weeks.{" "}
              {phone ? (
                <>
                  Call <a href={`tel:${phone}`}>{formatPhone(phone)}</a> and we&apos;ll fit you in.
                </>
              ) : (
                "Call us and we'll fit you in."
              )}
            </p>
          ) : (
            days.map(([day, slots]) => (
              <div key={day} className="bk-day">
                <p className="bk-day-label">{day}</p>
                <div className="bk-times">
                  {slots.map((s) => (
                    <button
                      key={s.at}
                      type="button"
                      className={`bk-time ${slot?.at === s.at ? "is-on" : ""}`}
                      aria-pressed={slot?.at === s.at}
                      disabled={Boolean(pending)}
                      onClick={() => setSlot(s)}
                    >
                      {timeOnly(s.at, tz)}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      ) : null}

      {slot ? (
        <form
          className="pf-card"
          aria-labelledby="bk-you"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 id="bk-you" className="pf-h2">
            Where should we reach you?
          </h2>
          <input
            className="pf-input"
            placeholder="Full name"
            autoComplete="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Full name"
          />
          <input
            className="pf-input"
            type="tel"
            placeholder="Mobile number"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            aria-label="Mobile number"
          />
          <input
            className="pf-input"
            type="email"
            placeholder="Email (optional)"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-label="Email"
          />
          <input
            className="pf-input"
            placeholder="Address (if we come to you)"
            autoComplete="street-address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            aria-label="Address"
          />
          <textarea
            placeholder="Anything we should know? (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            aria-label="Notes"
          />
          <input
            className="bk-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            name="website"
          />
          <label className="pf-muted bk-optin">
            <input
              type="checkbox"
              checked={form.marketingOptIn}
              onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })}
            />{" "}
            Also text me occasional reminders and offers from {info.business.name}, up to 2 a month. Optional.
          </label>
          <p className="pf-muted">
            By booking you agree to get texts about this appointment from {info.business.name}. Reply STOP to opt out.
          </p>
          {checking ? (
            <p className="pf-muted" role="status">
              {CHECKING}
            </p>
          ) : error ? (
            <p className="pf-error" role="alert">
              {error}
              {pending && phone ? ` You can also call ${formatPhone(phone)}.` : ""}
            </p>
          ) : null}
          <button type="submit" className="pf-btn pf-btn--primary" disabled={busy}>
            {checking
              ? "Checking…"
              : busy
                ? "Booking…"
                : pending
                  ? "Check if it went through"
                  : `Book ${timeOnly(slot.at, tz)}, ${dayKey(slot.at, tz)}`}
          </button>
        </form>
      ) : error ? (
        <p className="pf-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="pf-muted bk-foot">
        <a href={`/r/${encodeURIComponent(slug)}?via=booking`}>Booking by Orvius</a>
      </p>
    </main>
  );
}
