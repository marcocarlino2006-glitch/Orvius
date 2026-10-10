"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JOB_OUTCOMES, jobOutcomeLabel } from "@/lib/job-outcome";
import { forgetEverything, cachedGet, isGone, rememberGet, sendOrQueue, useFieldSync, useTechShell, type Queued } from "@/components/tech-app/offline";
import { directionsUrl, money, phoneLabel, StatusPill, SyncBar, techFetch, whenLabel } from "@/components/tech-app/shared";
import { shrinkPhoto } from "@/components/tech-app/photo";
import { signatureStatement } from "@/lib/job-signature-text";

type Line = { id?: string; name: string; kind: string; quantity: number; unitCents: number; totalCents?: number; priceBookItemId: string | null };
type Photo = { id: string; kind: "before" | "after" | "other"; caption: string | null; takenBy: string | null; createdAt: string };
type Note = { id: string; authorKind: "technician" | "person"; authorName: string; body: string; createdAt: string; pending?: boolean };
type CheckItem = { id: string; label: string; reading?: string; done: boolean; value: string | null; at: string | null };
type Checklist = { templateId: string; title: string; items: CheckItem[]; done: number; total: number };
type Signature = { signerName: string; signedAt: string; agreedCents: number | null; statement: string; pendingImage?: string };
type BookItem = { id: string; name: string; kind: string; unitCents: number; description: string | null };
type Money = {
  totalCents: number | null;
  taxCents?: number;
  depositPaidCents: number;
  balanceCents: number;
  cardReady: boolean;
  invoice: { status: string; amountCents: number; sentAt: string | null; paidAt: string | null; paidCents: number; payUrl: string | null; method: string | null } | null;
};
type Detail = {
  job: {
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
    durationMin: number | null;
    address: string | null;
    urgency: string | null;
    serviceType: string | null;
    officeNotes: string | null;
    etaText: string | null;
    customerConfirmed: boolean;
    resolutionCode: string | null;
    resolutionSummary: string | null;
    customerName: string | null;
    customerPhone: string | null;
  };
  shop: { name: string; timezone: string };
  technician: { name: string };
  lines: Line[];
  linesTotalCents: number;
  photos: Photo[];
  notes: Note[];
  checklist: Checklist | null;
  signature: Signature | null;
  priceBook: BookItem[];
  money: Money;
};

function countChecklist(c: Checklist): Checklist {
  return { ...c, done: c.items.filter((i) => i.done).length, total: c.items.length };
}

/** What the server last said, plus the changes still waiting on this phone, so the screen shows what the tech did. */
function withPending(d: Detail, base: string, queued: Queued[]): Detail {
  let next = d;
  for (const q of queued) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(q.body) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (q.url === base && typeof body.status === "string") {
      next = { ...next, job: { ...next.job, status: body.status, ...(typeof body.resolutionCode === "string" ? { resolutionCode: body.resolutionCode, resolutionSummary: typeof body.resolutionSummary === "string" ? body.resolutionSummary : null } : {}) } };
    } else if (q.url === `${base}/notes` && typeof body.body === "string") {
      next = { ...next, notes: [...next.notes, { id: `pending-${q.id}`, authorKind: "technician", authorName: d.technician.name, body: body.body, createdAt: q.at, pending: true }] };
    } else if (q.url === `${base}/checklist` && next.checklist && Array.isArray(body.items)) {
      const changes = new Map((body.items as Array<{ id: string; done?: boolean; value?: string }>).map((c) => [c.id, c]));
      const items = next.checklist.items.map((i) => {
        const c = changes.get(i.id);
        return c ? { ...i, done: c.done ?? i.done, value: c.value ?? i.value } : i;
      });
      next = { ...next, checklist: countChecklist({ ...next.checklist, items }) };
    } else if (q.url === `${base}/signature` && typeof body.name === "string" && typeof body.image === "string") {
      if (!next.signature || body.replace === true) {
        const agreed = next.lines.length ? next.linesTotalCents : null;
        next = { ...next, signature: { signerName: body.name, signedAt: q.at, agreedCents: agreed, statement: signatureStatement(agreed), pendingImage: body.image } };
      }
    }
  }
  return next;
}

function ChecklistCard({ base, checklist, onSaved }: { base: string; checklist: Checklist; onSaved: (c: Checklist) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(checklist.done < checklist.total);
  useEffect(() => setOptimistic({}), [checklist]);

  async function send(change: { id: string; done?: boolean; value?: string }) {
    setError(null);
    if (change.done != null) setOptimistic((o) => ({ ...o, [change.id]: change.done! }));
    try {
      const r = await sendOrQueue<{ checklist: Checklist }>(`${base}/checklist`, "PUT", { items: [{ ...change, at: new Date().toISOString() }] }, "A checklist change");
      if (!r.queued) onSaved(r.data.checklist);
    } catch (err) {
      setOptimistic((o) => {
        const rest = { ...o };
        delete rest[change.id];
        return rest;
      });
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    }
  }

  const items = checklist.items.map((i) => ({ ...i, done: optimistic[i.id] ?? i.done }));
  const done = items.filter((i) => i.done).length;
  return (
    <section className="ta-card" aria-labelledby="ta-check">
      <div className="ta-card-head">
        <h2 id="ta-check" className="ta-h3">
          {checklist.title} checklist
        </h2>
        <button type="button" className="ta-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {done} of {items.length} {open ? "· Hide" : "· Show"}
        </button>
      </div>
      {open ? (
        <ul className="ta-checklist">
          {items.map((item) => (
            <li key={item.id} className={item.done ? "is-done" : ""}>
              <label className="ta-check">
                <input type="checkbox" checked={item.done} onChange={(e) => void send({ id: item.id, done: e.target.checked })} />
                <span>{item.label}</span>
              </label>
              {item.reading ? (
                <input
                  className="ta-input ta-reading"
                  placeholder={item.reading}
                  aria-label={`${item.label}: ${item.reading}`}
                  maxLength={80}
                  value={draft[item.id] ?? item.value ?? ""}
                  onChange={(e) => setDraft({ ...draft, [item.id]: e.target.value })}
                  onBlur={() => {
                    const value = draft[item.id];
                    if (value == null || value.trim() === (item.value ?? "")) return;
                    void send({ id: item.id, value: value.trim(), ...(value.trim() && !item.done ? { done: true } : {}) });
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function exportPng() {
    const canvas = ref.current;
    if (!canvas || strokes.current < 8) return onChange(null);
    const width = Math.min(600, canvas.clientWidth);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = Math.round((canvas.clientHeight / canvas.clientWidth) * width);
    out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  }

  return (
    <div className="ta-sign">
      <canvas
        ref={ref}
        className="ta-sign-pad"
        aria-label="Signature box. The customer signs here with a finger."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const ctx = e.currentTarget.getContext("2d");
          const p = point(e);
          ctx?.beginPath();
          ctx?.moveTo(last.current.x, last.current.y);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
          last.current = p;
          strokes.current += 1;
        }}
        onPointerUp={() => {
          last.current = null;
          exportPng();
        }}
        onPointerCancel={() => {
          last.current = null;
        }}
      />
      <button
        type="button"
        className="ta-link"
        onClick={() => {
          const canvas = ref.current;
          canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
          strokes.current = 0;
          onChange(null);
        }}
      >
        Clear
      </button>
    </div>
  );
}

function SignOff({ base, detail, onSigned }: { base: string; detail: Detail; onSigned: (s: Signature) => void }) {
  const sig = detail.signature;
  const total = detail.lines.length ? detail.linesTotalCents : null;
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState(detail.job.customerName ?? "");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState(false);

  async function save() {
    if (!image) return setError("Have the customer sign in the box first.");
    if (!name.trim()) return setError("Type the customer's name under the signature.");
    setBusy(true);
    setError(null);
    try {
      const r = await sendOrQueue<{ signature: Signature }>(`${base}/signature`, "POST", { name: name.trim(), image, replace: Boolean(sig) }, "The customer's signature");
      if (!r.queued) onSigned(r.data.signature);
      setQueuedNote(r.queued);
      setSigning(false);
      setImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const changed = sig && sig.agreedCents != null && total != null && sig.agreedCents !== total;
  return (
    <section className="ta-card" aria-labelledby="ta-sign">
      <div className="ta-card-head">
        <h2 id="ta-sign" className="ta-h3">
          Customer sign-off
        </h2>
        <span className="ta-muted">{sig ? "Signed" : "Not signed"}</span>
      </div>
      {sig && !signing ? (
        <div className="ta-stack">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ta-sign-img" src={sig.pendingImage ?? `${base}/signature?at=${encodeURIComponent(sig.signedAt)}`} alt={`Signature of ${sig.signerName}`} />
          <p className="ta-muted">
            {sig.signerName} · {whenLabel(sig.signedAt, detail.shop.timezone)}: &ldquo;{sig.statement}&rdquo;
          </p>
          {sig.pendingImage || queuedNote ? <p className="ta-muted">Saved on this phone. It sends when you have bars.</p> : null}
          {changed ? <p className="ta-error">The work changed after they signed ({money(sig.agreedCents)} then, {money(total)} now). Ask them to sign again.</p> : null}
          <button type="button" className="ta-btn ta-btn--quiet" onClick={() => setSigning(true)}>
            Sign again
          </button>
        </div>
      ) : signing || !sig ? (
        <div className="ta-stack">
          <p className="ta-sign-statement">&ldquo;{signatureStatement(total)}&rdquo;</p>
          {!detail.lines.length ? <p className="ta-muted">No work added yet. Add the work above first so they sign for a total.</p> : null}
          <SignaturePad onChange={setImage} />
          <label className="ta-label" htmlFor="ta-sign-name">
            Customer&apos;s name
          </label>
          <input id="ta-sign-name" className="ta-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          <div className="ta-row2">
            {sig ? (
              <button type="button" className="ta-btn ta-btn--quiet" onClick={() => setSigning(false)}>
                Cancel
              </button>
            ) : null}
            <button type="button" className="ta-btn ta-btn--primary" disabled={busy || !image || !name.trim()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save signature"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const KIND_WORD: Record<string, string> = { service: "Service", labor: "Labor", part: "Part", discount: "Discount" };

function Photos({ base, detail, onChange }: { base: string; detail: Detail; onChange: (update: (photos: Photo[]) => Photo[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const before = useRef<HTMLInputElement>(null);
  const after = useRef<HTMLInputElement>(null);

  async function upload(kind: "before" | "after", files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const [i, file] of [...files].entries()) {
      setBusy(`Adding photo ${i + 1} of ${files.length}…`);
      try {
        const { blob, width, height } = await shrinkPhoto(file);
        const form = new FormData();
        form.append("photo", blob, "photo.jpg");
        form.append("kind", kind);
        form.append("width", String(width));
        form.append("height", String(height));
        const { photo } = await techFetch<{ photo: Photo }>(`${base}/photos`, { method: "POST", body: form });
        onChange((photos) => [...photos, photo]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That photo didn't upload.");
      }
    }
    setBusy(null);
  }

  async function remove(photo: Photo) {
    try {
      await techFetch(`${base}/photos/${photo.id}`, { method: "DELETE" });
      onChange((photos) => photos.filter((p) => p.id !== photo.id));
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it.");
    }
  }

  const groups = (["before", "after", "other"] as const).map((kind) => ({ kind, photos: detail.photos.filter((p) => p.kind === kind) })).filter((g) => g.photos.length);
  return (
    <section className="ta-card" aria-labelledby="ta-photos">
      <div className="ta-card-head">
        <h2 id="ta-photos" className="ta-h3">
          Photos
        </h2>
        <span className="ta-muted">{detail.photos.length || "None yet"}</span>
      </div>
      {groups.map((g) => (
        <div key={g.kind} className="ta-photo-group">
          <p className="ta-label">{g.kind === "before" ? "Before" : g.kind === "after" ? "After" : "From the office"}</p>
          <div className="ta-photos">
            {g.photos.map((p) => (
              <button key={p.id} type="button" className="ta-thumb" onClick={() => setOpen(p)} aria-label={`Open ${g.kind} photo`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}/photos/${p.id}`} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="ta-row2">
        <button type="button" className="ta-btn" disabled={Boolean(busy)} onClick={() => before.current?.click()}>
          Before photo
        </button>
        <button type="button" className="ta-btn" disabled={Boolean(busy)} onClick={() => after.current?.click()}>
          After photo
        </button>
      </div>
      <input ref={before} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void upload("before", e.target.files).then(() => (e.target.value = ""))} />
      <input ref={after} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void upload("after", e.target.files).then(() => (e.target.value = ""))} />
      {busy ? (
        <p className="ta-muted" role="status">
          {busy}
        </p>
      ) : null}
      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <div className="ta-viewer" role="dialog" aria-label="Photo" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${base}/photos/${open.id}`} alt="" />
          <div className="ta-viewer-bar" onClick={(e) => e.stopPropagation()}>
            <span>
              {open.kind === "other" ? "Photo" : open.kind === "before" ? "Before" : "After"} · {open.takenBy ?? ""}
            </span>
            {open.takenBy === detail.technician.name ? (
              <button type="button" className="ta-link ta-link--danger" onClick={() => void remove(open)}>
                Remove
              </button>
            ) : null}
            <button type="button" className="ta-link" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Notes({ base, detail, onChange }: { base: string; detail: Detail; onChange: (update: (notes: Note[]) => Note[]) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendOrQueue<{ note: Note }>(`${base}/notes`, "POST", { body }, "A note");
      if (!r.queued) onChange((notes) => [...notes, r.data.note]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the note.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ta-card" aria-labelledby="ta-notes">
      <h2 id="ta-notes" className="ta-h3">
        Notes
      </h2>
      {detail.job.officeNotes ? (
        <div className="ta-note ta-note--office">
          <p className="ta-note-who">From the office</p>
          <p className="ta-note-body">{detail.job.officeNotes}</p>
        </div>
      ) : null}
      {detail.notes.map((n) => (
        <div key={n.id} className={`ta-note${n.authorKind === "person" ? " ta-note--office" : ""}`}>
          <p className="ta-note-who">
            {n.authorKind === "technician" ? n.authorName : `Office · ${n.authorName}`} · {n.pending ? "waiting for signal" : whenLabel(n.createdAt, detail.shop.timezone)}
          </p>
          <p className="ta-note-body">{n.body}</p>
        </div>
      ))}
      <form onSubmit={add} className="ta-stack">
        <label className="ta-label" htmlFor="ta-note-new">
          Add a note for the office and the next visit
        </label>
        <textarea id="ta-note-new" className="ta-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What you found, what you did, what's next" maxLength={2000} />
        <button type="submit" className="ta-btn" disabled={busy || !body.trim()}>
          {busy ? "Saving…" : "Save note"}
        </button>
      </form>
      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Work({ base, detail, onSaved }: { base: string; detail: Detail; onSaved: (d: Detail) => void }) {
  const [lines, setLines] = useState<Line[]>(detail.lines);
  const [adding, setAdding] = useState<"book" | "custom" | null>(null);
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState({ name: "", price: "", quantity: "1", kind: "service" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = detail.money.invoice?.status === "paid";
  useEffect(() => setLines(detail.lines), [detail.lines]);

  const total = lines.reduce((sum, l) => sum + (l.kind === "discount" ? -1 : 1) * Math.round(l.quantity * l.unitCents), 0);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return detail.priceBook.filter((b) => !q || b.name.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q)).slice(0, 30);
  }, [detail.priceBook, search]);

  async function save(next: Line[]) {
    setBusy(true);
    setError(null);
    const previous = lines;
    setLines(next);
    try {
      onSaved(
        await techFetch<Detail>(`${base}/lines`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: next.map(({ name, kind, quantity, unitCents, priceBookItemId }) => ({ name, kind, quantity, unitCents, priceBookItemId })) }),
        }),
      );
    } catch (err) {
      setLines(previous);
      setError(err instanceof Error ? err.message : "Couldn't save the work.");
    } finally {
      setBusy(false);
    }
  }

  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(custom.price);
    const quantity = Number(custom.quantity) || 1;
    if (!custom.name.trim() || !Number.isFinite(dollars) || dollars < 0) {
      setError("Give the line a name and a price.");
      return;
    }
    void save([...lines, { name: custom.name.trim(), kind: custom.kind, quantity, unitCents: Math.round(dollars * 100), priceBookItemId: null }]).then(() => {
      setCustom({ name: "", price: "", quantity: "1", kind: "service" });
      setAdding(null);
    });
  }

  return (
    <section className="ta-card" aria-labelledby="ta-work">
      <div className="ta-card-head">
        <h2 id="ta-work" className="ta-h3">
          Work and price
        </h2>
        <span className="ta-total">{money(total)}</span>
      </div>
      {lines.length ? (
        <ul className="ta-lines">
          {lines.map((l, i) => (
            <li key={l.id ?? `${l.name}-${i}`} className="ta-line">
              <div className="ta-line-main">
                <span className="ta-line-name">{l.name}</span>
                <span className="ta-muted">
                  {KIND_WORD[l.kind] ?? "Service"} · {l.quantity !== 1 ? `${l.quantity} × ` : ""}
                  {money(l.unitCents)}
                </span>
              </div>
              <span className="ta-line-total">{l.kind === "discount" ? "−" : ""}{money(Math.round(l.quantity * l.unitCents))}</span>
              {!locked ? (
                <div className="ta-line-qty">
                  <button type="button" className="ta-step" aria-label={`One less ${l.name}`} disabled={busy} onClick={() => void save(l.quantity <= 1 ? lines.filter((_, j) => j !== i) : lines.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x)))}>
                    {l.quantity <= 1 ? "×" : "−"}
                  </button>
                  <button type="button" className="ta-step" aria-label={`One more ${l.name}`} disabled={busy} onClick={() => void save(lines.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))}>
                    +
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ta-muted">Add what you did. The customer is billed this total.</p>
      )}
      {locked ? <p className="ta-muted">Paid, so the work is locked.</p> : null}
      {!locked && adding === null ? (
        <div className="ta-row2">
          <button type="button" className="ta-btn" onClick={() => setAdding("book")} disabled={!detail.priceBook.length}>
            {detail.priceBook.length ? "From price book" : "No price book yet"}
          </button>
          <button type="button" className="ta-btn" onClick={() => setAdding("custom")}>
            Custom line
          </button>
        </div>
      ) : null}
      {adding === "book" ? (
        <div className="ta-stack">
          <input className="ta-input" placeholder="Search services and parts" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <ul className="ta-book">
            {matches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="ta-book-item"
                  disabled={busy}
                  onClick={() => {
                    void save([...lines, { name: b.name, kind: b.kind, quantity: 1, unitCents: b.unitCents, priceBookItemId: b.id }]);
                    setAdding(null);
                    setSearch("");
                  }}
                >
                  <span>
                    <span className="ta-line-name">{b.name}</span>
                    <span className="ta-muted">{KIND_WORD[b.kind] ?? "Service"}{b.description ? ` · ${b.description}` : ""}</span>
                  </span>
                  <span className="ta-line-total">{money(b.unitCents)}</span>
                </button>
              </li>
            ))}
            {!matches.length ? <li className="ta-muted">Nothing matches. Add a custom line instead.</li> : null}
          </ul>
          <button type="button" className="ta-link" onClick={() => setAdding(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      {adding === "custom" ? (
        <form className="ta-stack" onSubmit={addCustom}>
          <input className="ta-input" placeholder="What you did or used" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} autoFocus maxLength={120} />
          <div className="ta-row3">
            <select className="ta-input" value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value })} aria-label="Kind">
              <option value="service">Service</option>
              <option value="labor">Labor</option>
              <option value="part">Part</option>
              <option value="discount">Discount</option>
            </select>
            <input className="ta-input" inputMode="decimal" placeholder="Price $" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} aria-label="Price in dollars" />
            <input className="ta-input" inputMode="decimal" placeholder="Qty" value={custom.quantity} onChange={(e) => setCustom({ ...custom, quantity: e.target.value })} aria-label="Quantity" />
          </div>
          <div className="ta-row2">
            <button type="button" className="ta-btn ta-btn--quiet" onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button type="submit" className="ta-btn" disabled={busy}>
              Add line
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Pay({ base, detail, onPaid }: { base: string; detail: Detail; onPaid: (d: Detail) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const m = detail.money;
  const paid = m.invoice?.status === "paid";

  async function collect(method: "text" | "here" | "cash" | "check") {
    if ((method === "cash" || method === "check") && !window.confirm(`Mark ${money(m.balanceCents)} paid by ${method}?`)) return;
    setBusy(method);
    setError(null);
    setDone(null);
    const tab = method === "here" ? window.open("", "_blank") : null;
    try {
      const next = await techFetch<Detail>(`${base}/collect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
      onPaid(next);
      if (method === "here") {
        if (next.money.invoice?.payUrl && tab) tab.location.href = next.money.invoice.payUrl;
        else tab?.close();
      }
      setDone(method === "text" ? `Pay link texted to ${detail.job.customerName ?? "the customer"}.` : method === "here" ? "Pay page opened. Hand them your phone." : `Recorded ${method}.`);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ta-card" aria-labelledby="ta-pay">
      <div className="ta-card-head">
        <h2 id="ta-pay" className="ta-h3">
          Get paid
        </h2>
        <span className={`ta-total${paid ? " is-paid" : ""}`}>{paid ? "Paid" : m.totalCents ? `${money(m.balanceCents)} due` : "—"}</span>
      </div>
      {!paid && m.totalCents && m.taxCents ? <p className="ta-muted">Includes {money(m.taxCents)} sales tax.</p> : null}
      {m.depositPaidCents ? <p className="ta-muted">{money(m.depositPaidCents)} deposit already paid.</p> : null}
      {paid ? (
        <p className="ta-ok">
          Paid {money(m.invoice?.paidCents || m.invoice?.amountCents || 0)}
          {m.invoice?.method && m.invoice.method !== "recorded" ? ` by ${m.invoice.method.startsWith("stripe") ? "card" : m.invoice.method}` : ""}. Nothing to collect.
        </p>
      ) : !m.totalCents ? (
        <p className="ta-muted">Add the work above to get a total.</p>
      ) : (
        <>
          {m.invoice?.sentAt ? <p className="ta-muted">Pay link sent {whenLabel(m.invoice.sentAt, detail.shop.timezone)}.</p> : null}
          {m.cardReady ? (
            <div className="ta-row2">
              <button type="button" className="ta-btn ta-btn--primary" disabled={Boolean(busy)} onClick={() => void collect("here")}>
                {busy === "here" ? "Opening…" : "Pay on this phone"}
              </button>
              <button type="button" className="ta-btn" disabled={Boolean(busy) || !detail.job.customerPhone} onClick={() => void collect("text")}>
                {busy === "text" ? "Texting…" : m.invoice?.sentAt ? "Text it again" : "Text pay link"}
              </button>
            </div>
          ) : (
            <p className="ta-muted">Card payments aren&apos;t set up for this shop yet. Collect cash or a check.</p>
          )}
          <div className="ta-row2">
            <button type="button" className="ta-btn ta-btn--quiet" disabled={Boolean(busy)} onClick={() => void collect("cash")}>
              {busy === "cash" ? "Saving…" : "Paid cash"}
            </button>
            <button type="button" className="ta-btn ta-btn--quiet" disabled={Boolean(busy)} onClick={() => void collect("check")}>
              {busy === "check" ? "Saving…" : "Paid by check"}
            </button>
          </div>
        </>
      )}
      {done ? (
        <p className="ta-ok" role="status">
          {done}
        </p>
      ) : null}
      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const NEXT: Record<string, { label: string; status: string } | null> = {
  scheduled: { label: "On my way", status: "en_route" },
  confirmed: { label: "On my way", status: "en_route" },
  en_route: { label: "I've arrived", status: "on_site" },
  on_site: null,
  completed: null,
  cancelled: null,
};

/** One job on the technician's phone, from driving there to getting paid. */
export function TechJob({ token, jobId }: { token: string; jobId: string }) {
  const base = `/api/tech/${token}/jobs/${jobId}`;
  const [loaded, setDetail] = useState<Detail | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eta, setEta] = useState("");
  const [outcome, setOutcome] = useState("");
  const [summary, setSummary] = useState("");
  const [amount, setAmount] = useState("");
  const finishRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const { data, savedAt: at } = await cachedGet<Detail>(base);
      setDetail(data);
      setSavedAt(at);
      setError(null);
    } catch (err) {
      if (isGone(err)) setDetail(null);
      setError(err instanceof Error ? err.message : "Couldn't open the job.");
    }
  }, [base]);
  const sync = useFieldSync(() => void load());
  useTechShell();
  useEffect(() => {
    if (error && /link is off/i.test(error)) forgetEverything();
  }, [error]);
  const detail = useMemo(() => (loaded ? withPending(loaded, base, sync.queued) : null), [loaded, base, sync.queued]);
  useEffect(() => {
    if (loaded && !savedAt) rememberGet(base, loaded);
  }, [loaded, savedAt, base]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function update(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await sendOrQueue<Detail>(base, "PATCH", { ...body, happenedAt: new Date().toISOString() }, body.status === "completed" ? "Finishing the job" : "A status change");
      if (!r.queued) setDetail(r.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <main className="ta">
        <Link href={`/tech/${token}`} className="ta-back">
          ← Your day
        </Link>
        {error ? (
          <section className="ta-card ta-empty">
            <h1 className="ta-title">Can&apos;t open this job</h1>
            <p className="ta-muted">{error}</p>
          </section>
        ) : (
          <p className="ta-muted" aria-busy>
            Loading the job…
          </p>
        )}
      </main>
    );
  }

  const { job, shop } = detail;
  const next = NEXT[job.status] ?? null;
  const hasLines = detail.lines.length > 0;

  function finish() {
    if (!outcome) {
      setError("Pick what happened first.");
      finishRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const dollars = amount.trim() ? Number(amount) : null;
    if (dollars != null && (!Number.isFinite(dollars) || dollars < 0 || dollars > 50_000)) {
      setError("The amount must be between $0 and $50,000.");
      return;
    }
    void update({ status: "completed", resolutionCode: outcome, resolutionSummary: summary, finalAmountCents: hasLines || dollars == null ? null : Math.round(dollars * 100) });
  }

  return (
    <main className="ta ta--job">
      <Link href={`/tech/${token}`} className="ta-back">
        ← Your day
      </Link>
      <header className="ta-head">
        <p className="ta-kicker">{shop.name}</p>
        <h1 className="ta-title">{job.title}</h1>
        <p className="ta-sub ta-meta">
          <StatusPill status={job.status} urgency={job.urgency} />
          {whenLabel(job.scheduledAt, shop.timezone)}
          {job.durationMin ? ` · ${job.durationMin >= 60 ? `${Math.round((job.durationMin / 60) * 10) / 10} h` : `${job.durationMin} min`}` : ""}
        </p>
      </header>

      <div className="ta-actions">
        {job.customerPhone ? (
          <>
            <a className="ta-action" href={`tel:${job.customerPhone}`}>
              <span className="ta-action-label">Call</span>
              <span className="ta-action-detail">{job.customerName ?? phoneLabel(job.customerPhone)}</span>
            </a>
            <a className="ta-action" href={`sms:${job.customerPhone}`}>
              <span className="ta-action-label">Text</span>
              <span className="ta-action-detail">{phoneLabel(job.customerPhone)}</span>
            </a>
          </>
        ) : null}
        {job.address ? (
          <a className="ta-action ta-action--wide" href={directionsUrl(job.address)} target="_blank" rel="noreferrer">
            <span className="ta-action-label">Directions</span>
            <span className="ta-action-detail">{job.address}</span>
          </a>
        ) : null}
      </div>

      <SyncBar online={sync.online} savedAt={savedAt} queued={sync.queued.length} failed={sync.failed} timeZone={shop.timezone} onDismiss={sync.dismissFailed} />

      <section className="ta-card">
        <dl className="ta-kv">
          <div>
            <dt>Customer</dt>
            <dd>{job.customerName ?? (job.customerPhone ? phoneLabel(job.customerPhone) : "Unknown")}</dd>
          </div>
          {job.status === "scheduled" || job.status === "confirmed" ? (
            <div>
              <dt>Time</dt>
              <dd>{job.customerConfirmed ? "Customer confirmed" : "Not confirmed by the customer yet"}</dd>
            </div>
          ) : null}
          {job.serviceType && job.serviceType !== job.title ? (
            <div>
              <dt>Request</dt>
              <dd>{job.serviceType}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {error ? (
        <p className="ta-error" role="alert">
          {error}
        </p>
      ) : null}

      {job.status === "scheduled" || job.status === "confirmed" ? (
        <section className="ta-card" aria-labelledby="ta-eta">
          <h2 id="ta-eta" className="ta-h3">
            How long until you get there?
          </h2>
          <p className="ta-muted">It goes in the customer&apos;s &ldquo;on the way&rdquo; text.</p>
          <div className="ta-chips">
            {["15 min", "30 min", "45 min", "1 hour"].map((v) => (
              <button key={v} type="button" className={`ta-chip${eta === v ? " is-on" : ""}`} aria-pressed={eta === v} onClick={() => setEta(eta === v ? "" : v)}>
                {v}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Work base={base} detail={detail} onSaved={setDetail} />
      {detail.checklist && (job.status === "on_site" || job.status === "completed") ? (
        <ChecklistCard base={base} checklist={detail.checklist} onSaved={(checklist) => setDetail((d) => (d ? { ...d, checklist } : d))} />
      ) : null}
      <Photos base={base} detail={detail} onChange={(update) => setDetail((d) => (d ? { ...d, photos: update(d.photos) } : d))} />
      <Notes base={base} detail={detail} onChange={(update) => setDetail((d) => (d ? { ...d, notes: update(d.notes) } : d))} />
      {job.status === "on_site" || job.status === "completed" ? <SignOff base={base} detail={detail} onSigned={(signature) => setDetail((d) => (d ? { ...d, signature } : d))} /> : null}
      {job.status === "on_site" || job.status === "completed" || hasLines ? <Pay base={base} detail={detail} onPaid={setDetail} /> : null}

      {job.status === "on_site" ? (
        <section ref={finishRef} className="ta-card" aria-labelledby="ta-finish">
          <h2 id="ta-finish" className="ta-h3">
            Finish the job
          </h2>
          {detail.checklist && detail.checklist.done < detail.checklist.total ? (
            <p className="ta-muted">
              Checklist: {detail.checklist.done} of {detail.checklist.total} done.
            </p>
          ) : null}
          {!detail.signature ? <p className="ta-muted">The customer hasn&apos;t signed off yet.</p> : null}
          <label className="ta-label" htmlFor="ta-outcome">
            What happened?
          </label>
          <select id="ta-outcome" className="ta-input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Pick one</option>
            {JOB_OUTCOMES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="ta-label" htmlFor="ta-summary">
            What fixed it? <em>Optional</em>
          </label>
          <textarea id="ta-summary" className="ta-input" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Replaced failed 45/5 capacitor" maxLength={500} />
          {!hasLines ? (
            <>
              <label className="ta-label" htmlFor="ta-amount">
                Final amount <em>Optional — or add the work above</em>
              </label>
              <input id="ta-amount" className="ta-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0.00" />
            </>
          ) : null}
        </section>
      ) : null}

      {job.status === "completed" ? (
        <section className="ta-card ta-done">
          <h2 className="ta-h3">Job done</h2>
          <p className="ta-muted">
            {job.resolutionCode ? jobOutcomeLabel(job.resolutionCode) : "Finished"}
            {job.resolutionSummary ? ` · ${job.resolutionSummary}` : ""}
          </p>
        </section>
      ) : null}

      <div className="ta-dock">
        {next ? (
          <button type="button" className="ta-btn ta-btn--primary ta-btn--big" disabled={busy} onClick={() => void update({ status: next.status, ...(next.status === "en_route" && eta ? { etaText: eta } : {}) })}>
            {busy ? "Saving…" : next.label}
          </button>
        ) : job.status === "on_site" ? (
          <button type="button" className="ta-btn ta-btn--primary ta-btn--big" disabled={busy} onClick={finish}>
            {busy ? "Finishing…" : "Finish job"}
          </button>
        ) : (
          <Link href={`/tech/${token}`} className="ta-btn ta-btn--big">
            Back to your day
          </Link>
        )}
      </div>
    </main>
  );
}
