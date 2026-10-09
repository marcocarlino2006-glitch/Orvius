"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import { shrinkPhoto } from "@/components/tech-app/photo";
import { personName } from "@/lib/people";
import { formatWhen } from "@/lib/when";

type Line = { id?: string; name: string; kind: string; quantity: number; unitCents: number; priceBookItemId: string | null };
type Photo = { id: string; kind: "before" | "after" | "other"; takenBy: string | null; createdAt: string };
type Note = { id: string; authorKind: "technician" | "person"; authorName: string; body: string; createdAt: string };
type BookItem = { id: string; name: string; kind: string; unitCents: number; description: string | null };
type ChecklistItem = { id: string; label: string; reading?: string; done: boolean; value: string | null; at: string | null };
type Checklist = { title: string; items: ChecklistItem[]; done: number; total: number };
type Signature = { signerName: string; signedAt: string; agreedCents: number | null; statement: string };
type Field = { lines: Line[]; totalCents: number; photos: Photo[]; notes: Note[]; priceBook: BookItem[]; checklist: Checklist | null; signature: Signature | null };

const KIND_WORD: Record<string, string> = { service: "Service", labor: "Labor", part: "Part", discount: "Discount" };

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/**
 * The work on a job, the same record the technician fills in from the field:
 * what was done and what it costs, the photos, and the notes.
 */
export function JobFieldPanel({ jobId, locked, timezone, onChange }: { jobId: string; locked: boolean; timezone?: string | null; onChange?: () => void }) {
  const [field, setField] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState({ name: "", price: "", kind: "service" });
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState<"work" | "note" | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/field`);
    const data = (await res.json().catch(() => ({}))) as Field & { error?: string };
    if (!res.ok) return setError(data.error ?? "Couldn't load the work on this job.");
    setField(data);
    setError(null);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(() => (field ? field.lines.reduce((s, l) => s + (l.kind === "discount" ? -1 : 1) * Math.round(l.quantity * l.unitCents), 0) : 0), [field]);

  async function saveLines(lines: Line[]) {
    if (!field) return;
    setBusy(true);
    const previous = field.lines;
    setField({ ...field, lines });
    try {
      const res = await fetch(`/api/jobs/${jobId}/field`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: lines.map(({ name, kind, quantity, unitCents, priceBookItemId }) => ({ name, kind, quantity, unitCents, priceBookItemId })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { lines?: Line[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the work.");
      setField((f) => (f ? { ...f, lines: data.lines ?? lines } : f));
      onChange?.();
    } catch (err) {
      setField((f) => (f ? { ...f, lines: previous } : f));
      toast({ title: err instanceof Error ? err.message : "Couldn't save the work.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !field) return;
    setBusy(true);
    let photos = field.photos;
    for (const file of files) {
      try {
        const { blob, width, height } = await shrinkPhoto(file);
        const form = new FormData();
        form.append("photo", blob, "photo.jpg");
        form.append("width", String(width));
        form.append("height", String(height));
        const res = await fetch(`/api/jobs/${jobId}/photos`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { photo?: Photo; error?: string };
        if (!res.ok || !data.photo) throw new Error(data.error ?? "That photo didn't upload.");
        photos = [...photos, data.photo];
        setField((f) => (f ? { ...f, photos } : f));
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : "That photo didn't upload.", tone: "error" });
      }
    }
    setBusy(false);
    onChange?.();
  }

  async function removePhoto(photo: Photo) {
    const res = await fetch(`/api/jobs/${jobId}/photos/${photo.id}`, { method: "DELETE" });
    if (!res.ok) return toast({ title: "Couldn't remove the photo.", tone: "error" });
    setField((f) => (f ? { ...f, photos: f.photos.filter((p) => p.id !== photo.id) } : f));
    setViewing(null);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/jobs/${jobId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: note }) });
    const data = (await res.json().catch(() => ({}))) as { note?: Note; error?: string };
    setBusy(false);
    if (!res.ok || !data.note) return toast({ title: data.error ?? "Couldn't save the note.", tone: "error" });
    setField((f) => (f ? { ...f, notes: [...f.notes, data.note!] } : f));
    setNote("");
    setAdding(null);
    onChange?.();
  }

  if (error) return <p className="cb-error" role="alert">{error}</p>;
  if (!field) {
    return (
      <section className="jf" aria-busy>
        <span className="skeleton" style={{ width: "40%", height: 14 }} />
      </section>
    );
  }

  const groups = (["before", "after", "other"] as const).map((kind) => ({ kind, photos: field.photos.filter((p) => p.kind === kind) })).filter((g) => g.photos.length);

  return (
    <section className="jf" aria-label="Work on this job">
      <div className="jf-head">
        <h3 className="jf-title">Line items</h3>
        {field.lines.length ? <span className="jf-total">{usd(total)}</span> : null}
        {!locked && adding !== "work" ? (
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm jf-head-btn" onClick={() => setAdding("work")}>
            Add work
          </button>
        ) : null}
      </div>
      {field.lines.length ? (
        <table className="jf-lines">
          <tbody>
            {field.lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td>
                  <span className="jf-line-name">{l.name}</span>
                  <span className="jf-line-kind">{KIND_WORD[l.kind] ?? "Service"}</span>
                </td>
                <td className="jf-num">
                  {locked ? (
                    l.quantity
                  ) : (
                    <input
                      className="jf-qty"
                      type="number"
                      min="0.01"
                      step="any"
                      aria-label={`Quantity of ${l.name}`}
                      defaultValue={l.quantity}
                      onBlur={(e) => {
                        const q = Number(e.target.value);
                        if (q > 0 && q !== l.quantity) void saveLines(field.lines.map((x, j) => (j === i ? { ...x, quantity: q } : x)));
                      }}
                    />
                  )}
                </td>
                <td className="jf-num">× {usd(l.unitCents)}</td>
                <td className="jf-num jf-line-total">
                  {l.kind === "discount" ? "−" : ""}
                  {usd(Math.round(l.quantity * l.unitCents))}
                </td>
                <td className="jf-num">
                  {!locked ? (
                    <button type="button" className="jf-x" aria-label={`Remove ${l.name}`} disabled={busy} onClick={() => void saveLines(field.lines.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="jf-muted">Nothing added yet. The customer is billed this list, and the technician sees it too.</p>
      )}
      {locked ? (
        <p className="jf-muted">Paid, so the work is locked.</p>
      ) : adding !== "work" ? null : (
        <div className="jf-add">
          <select
            className="wc-select"
            value={pick}
            aria-label="Add from the price book"
            onChange={(e) => {
              const item = field.priceBook.find((b) => b.id === e.target.value);
              setPick("");
              if (item) void saveLines([...field.lines, { name: item.name, kind: item.kind, quantity: 1, unitCents: item.unitCents, priceBookItemId: item.id }]);
            }}
          >
            <option value="">{field.priceBook.length ? "Add from price book…" : "Price book is empty"}</option>
            {field.priceBook.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {usd(b.unitCents)}
              </option>
            ))}
          </select>
          <form
            className="jf-custom"
            onSubmit={(e) => {
              e.preventDefault();
              const dollars = Number(custom.price);
              if (!custom.name.trim() || !Number.isFinite(dollars) || dollars < 0) return toast({ title: "Give the line a name and a price.", tone: "error" });
              void saveLines([...field.lines, { name: custom.name.trim(), kind: custom.kind, quantity: 1, unitCents: Math.round(dollars * 100), priceBookItemId: null }]).then(() => setCustom({ name: "", price: "", kind: "service" }));
            }}
          >
            <input className="input" placeholder="Custom line" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} maxLength={120} aria-label="Line name" />
            <select className="wc-select" value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value })} aria-label="Kind">
              <option value="service">Service</option>
              <option value="labor">Labor</option>
              <option value="part">Part</option>
              <option value="discount">Discount</option>
            </select>
            <input className="input jf-price" inputMode="decimal" placeholder="$" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} aria-label="Price in dollars" />
            <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={busy}>
              Add
            </button>
          </form>
          <div className="jf-add-foot">
            <Link href="/dashboard/price-book" className="jf-link">
              Edit price book →
            </Link>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setAdding(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      <div className="jf-head jf-head--rule">
        <h3 className="jf-title">Photos</h3>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm jf-head-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          Add photos
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files).then(() => (e.target.value = ""))} />
      </div>
      {groups.length ? (
        groups.map((g) => (
          <div key={g.kind} className="jf-photo-group">
            <p className="jf-label">{g.kind === "before" ? "Before" : g.kind === "after" ? "After" : "Other"}</p>
            <div className="jf-photos">
              {g.photos.map((p) => (
                <button key={p.id} type="button" className="jf-thumb" onClick={() => setViewing(p)} aria-label={`Open ${g.kind} photo by ${p.takenBy ?? "someone"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/jobs/${jobId}/photos/${p.id}`} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="jf-muted">None yet. The technician adds before and after photos from their phone.</p>
      )}

      {field.checklist && field.checklist.done > 0 ? (
        <>
          <div className="jf-head jf-head--rule">
            <h3 className="jf-title">{field.checklist.title} checklist</h3>
            <span className="jf-muted">
              {field.checklist.done} of {field.checklist.total}
            </span>
          </div>
          <ul className="jf-checklist">
            {field.checklist.items.map((item) => (
              <li key={item.id} className={item.done ? "is-done" : ""}>
                <span aria-hidden>{item.done ? "✓" : "–"}</span>
                <span>
                  {item.label}
                  {item.value ? <strong> · {item.value}</strong> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {field.signature ? (
        <>
          <div className="jf-head jf-head--rule">
            <h3 className="jf-title">Customer sign-off</h3>
            <span className="jf-muted">{formatWhen(field.signature.signedAt, undefined, timezone)}</span>
          </div>
          <div className="jf-signature">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/jobs/${jobId}/signature`} alt={`Signature of ${field.signature.signerName}`} />
            <p>
              <strong>{field.signature.signerName}</strong>: &ldquo;{field.signature.statement}&rdquo;
            </p>
            {field.signature.agreedCents != null && field.lines.length && field.signature.agreedCents !== field.totalCents ? (
              <p className="jf-warn">The work changed after signing: signed for {usd(field.signature.agreedCents)}, now {usd(field.totalCents)}.</p>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="jf-head jf-head--rule">
        <h3 className="jf-title">Notes</h3>
        {adding !== "note" ? (
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm jf-head-btn" onClick={() => setAdding("note")}>
            Add note
          </button>
        ) : null}
      </div>
      {field.notes.length ? (
        <ul className="jf-notes">
          {field.notes.map((n) => (
            <li key={n.id} className={`jf-note${n.authorKind === "technician" ? " jf-note--field" : ""}`}>
              <p className="jf-note-who">
                {n.authorName.includes("@") ? personName(n.authorName) : n.authorName}
                {n.authorKind === "technician" ? " · technician" : ""} · {formatWhen(n.createdAt, undefined, timezone)}
              </p>
              <p className="jf-note-body">{n.body}</p>
            </li>
          ))}
        </ul>
      ) : adding !== "note" ? (
        <p className="jf-muted">None yet.</p>
      ) : null}
      {adding === "note" ? (
        <form className="jf-note-form" onSubmit={addNote}>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The technician sees this on their phone" maxLength={2000} aria-label="New note" autoFocus />
          <div className="jf-add-foot">
            <button type="submit" className="ox-btn ox-btn--primary ox-btn--sm" disabled={busy || !note.trim()}>
              Save note
            </button>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => { setAdding(null); setNote(""); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {viewing ? (
        <div className="jf-viewer" role="dialog" aria-label="Photo" onClick={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/jobs/${jobId}/photos/${viewing.id}`} alt="" />
          <div className="jf-viewer-bar" onClick={(e) => e.stopPropagation()}>
            <span>
              {viewing.kind === "other" ? "Photo" : viewing.kind === "before" ? "Before" : "After"} · {viewing.takenBy ?? ""} · {formatWhen(viewing.createdAt, undefined, timezone)}
            </span>
            <a className="ox-btn ox-btn--quiet ox-btn--sm" href={`/api/jobs/${jobId}/photos/${viewing.id}`} target="_blank" rel="noreferrer">
              Full size
            </a>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => void removePhoto(viewing)}>
              Remove
            </button>
            <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
