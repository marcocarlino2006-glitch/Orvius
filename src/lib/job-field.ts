import { recordAudit, type AuditActor } from "@/lib/audit";
import { upsertJobInvoice } from "@/lib/invoice-pay";
import { applyChecklist, checklistTemplateFor, readChecklist } from "@/lib/job-checklist";
import { prisma } from "@/lib/prisma";

export const LINE_KINDS = ["service", "labor", "part", "discount"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const PHOTO_KINDS = ["before", "after", "other"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const MAX_LINES = 100;
export const MAX_PHOTOS_PER_JOB = 60;
/* Phones resize to about 1600px before upload; anything bigger did not go through that. */
export const MAX_PHOTO_BYTES = 1_500_000;
const MAX_UNIT_CENTS = 5_000_000;

export type LineInput = {
  name: string;
  kind?: string;
  quantity?: number;
  unitCents: number;
  priceBookItemId?: string | null;
};

export type JobLine = {
  id: string;
  name: string;
  kind: LineKind;
  quantity: number;
  unitCents: number;
  totalCents: number;
  priceBookItemId: string | null;
};

export type JobPhotoMeta = {
  id: string;
  kind: PhotoKind;
  caption: string | null;
  takenBy: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type JobNoteView = {
  id: string;
  authorKind: "technician" | "person";
  authorName: string;
  body: string;
  createdAt: string;
};

export class FieldError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function lineKind(kind: string | undefined): LineKind {
  return (LINE_KINDS as readonly string[]).includes(kind ?? "") ? (kind as LineKind) : "service";
}

export function lineTotalCents(line: { kind: string; quantity: number; unitCents: number }) {
  const amount = Math.round(line.quantity * line.unitCents);
  return line.kind === "discount" ? -amount : amount;
}

/** Validated lines, or a FieldError naming the first problem in the owner's words. */
export function cleanLines(input: unknown): Array<Omit<JobLine, "id" | "totalCents">> {
  if (!Array.isArray(input)) throw new FieldError("Send the list of lines.");
  if (input.length > MAX_LINES) throw new FieldError(`A job can have up to ${MAX_LINES} lines.`);
  const lines = input.map((raw: LineInput, i) => {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, 120) : "";
    if (!name) throw new FieldError(`Line ${i + 1} needs a name.`);
    const quantity = raw.quantity == null ? 1 : Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) throw new FieldError(`Line ${i + 1}: quantity must be between 0 and 1,000.`);
    const unitCents = Number(raw.unitCents);
    if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > MAX_UNIT_CENTS) throw new FieldError(`Line ${i + 1}: price must be between $0 and $50,000.`);
    return {
      name,
      kind: lineKind(raw.kind),
      quantity: Math.round(quantity * 100) / 100,
      unitCents,
      priceBookItemId: typeof raw.priceBookItemId === "string" && raw.priceBookItemId ? raw.priceBookItemId : null,
    };
  });
  const total = lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
  if (total < 0) throw new FieldError("Discounts can't be more than the work.");
  if (total > MAX_UNIT_CENTS) throw new FieldError("A job can't total more than $50,000.");
  return lines;
}

function toLine(row: { id: string; name: string; kind: string; quantity: number; unitCents: number; priceBookItemId: string | null }): JobLine {
  return {
    id: row.id,
    name: row.name,
    kind: lineKind(row.kind),
    quantity: row.quantity,
    unitCents: row.unitCents,
    totalCents: lineTotalCents(row),
    priceBookItemId: row.priceBookItemId,
  };
}

async function ownJob(businessId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, businessId }, select: { id: true, status: true } });
  if (!job) throw new FieldError("Job not found", 404);
  return job;
}

/**
 * Replace a job's lines. The job is then billed their total: the final amount
 * follows the lines, and an unpaid invoice the customer may already hold is
 * re-priced rather than duplicated.
 */
export async function setJobLines(businessId: string, jobId: string, input: unknown) {
  await ownJob(businessId, jobId);
  const lines = cleanLines(input);
  const paid = await prisma.invoice.findFirst({ where: { businessId, jobId, status: "paid" }, select: { id: true } });
  if (paid) throw new FieldError("This job is already paid, so its lines are locked.", 409);
  const known = new Set(
    (
      await prisma.priceBookItem.findMany({
        where: { businessId, id: { in: lines.map((l) => l.priceBookItemId).filter((id): id is string => Boolean(id)) } },
        select: { id: true },
      })
    ).map((p) => p.id),
  );
  const totalCents = lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
  await prisma.$transaction([
    prisma.jobLineItem.deleteMany({ where: { jobId, businessId } }),
    prisma.jobLineItem.createMany({
      data: lines.map((l, position) => ({
        businessId,
        jobId,
        name: l.name,
        kind: l.kind,
        quantity: l.quantity,
        unitCents: l.unitCents,
        priceBookItemId: l.priceBookItemId && known.has(l.priceBookItemId) ? l.priceBookItemId : null,
        position,
      })),
    }),
    prisma.job.update({ where: { id: jobId }, data: { finalAmountCents: lines.length ? totalCents : null } }),
  ]);
  const open = await prisma.invoice.findFirst({ where: { businessId, jobId, status: { not: "paid" } }, select: { id: true } });
  if (open && totalCents > 0) await upsertJobInvoice({ businessId, jobId, totalCents });
  return jobLines(businessId, jobId);
}

export async function jobLines(businessId: string, jobId: string) {
  const rows = await prisma.jobLineItem.findMany({ where: { businessId, jobId }, orderBy: { position: "asc" } });
  const lines = rows.map(toLine);
  return { lines, totalCents: lines.reduce((sum, l) => sum + l.totalCents, 0) };
}

const SIGNATURES: Array<{ mime: string; test: (b: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    mime: "image/webp",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/** The image type read from the bytes themselves; a declared type is never trusted. */
export function sniffImage(bytes: Uint8Array): string | null {
  return SIGNATURES.find((s) => bytes.length > 12 && s.test(bytes))?.mime ?? null;
}

export async function addJobPhoto(params: {
  businessId: string;
  jobId: string;
  bytes: Uint8Array;
  kind?: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  takenBy: string;
  technicianId?: string | null;
}) {
  await ownJob(params.businessId, params.jobId);
  if (!params.bytes.length) throw new FieldError("That photo is empty.");
  if (params.bytes.length > MAX_PHOTO_BYTES) throw new FieldError("That photo is too large. Take it again from the app.", 413);
  const mime = sniffImage(params.bytes);
  if (!mime) throw new FieldError("Only JPEG, PNG or WebP photos.", 415);
  const count = await prisma.jobPhoto.count({ where: { jobId: params.jobId } });
  if (count >= MAX_PHOTOS_PER_JOB) throw new FieldError(`A job can hold up to ${MAX_PHOTOS_PER_JOB} photos.`, 409);
  const dim = (n: number | null | undefined) => (Number.isInteger(n) && n! > 0 && n! < 20_000 ? n! : null);
  const row = await prisma.jobPhoto.create({
    data: {
      businessId: params.businessId,
      jobId: params.jobId,
      kind: (PHOTO_KINDS as readonly string[]).includes(params.kind ?? "") ? params.kind! : "other",
      mime,
      bytes: Buffer.from(params.bytes),
      sizeBytes: params.bytes.length,
      width: dim(params.width),
      height: dim(params.height),
      caption: params.caption?.trim().slice(0, 200) || null,
      takenBy: params.takenBy.slice(0, 120),
      technicianId: params.technicianId ?? null,
    },
    select: { id: true, kind: true, caption: true, takenBy: true, width: true, height: true, createdAt: true },
  });
  return toPhoto(row);
}

function toPhoto(row: { id: string; kind: string; caption: string | null; takenBy: string | null; width: number | null; height: number | null; createdAt: Date }): JobPhotoMeta {
  return {
    id: row.id,
    kind: (PHOTO_KINDS as readonly string[]).includes(row.kind) ? (row.kind as PhotoKind) : "other",
    caption: row.caption,
    takenBy: row.takenBy,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function jobPhotos(businessId: string, jobId: string) {
  const rows = await prisma.jobPhoto.findMany({
    where: { businessId, jobId },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, caption: true, takenBy: true, width: true, height: true, createdAt: true },
  });
  return rows.map(toPhoto);
}

export async function photoFile(businessId: string, jobId: string, photoId: string) {
  return prisma.jobPhoto.findFirst({ where: { id: photoId, jobId, businessId }, select: { mime: true, bytes: true } });
}

export async function deleteJobPhoto(businessId: string, jobId: string, photoId: string) {
  const gone = await prisma.jobPhoto.deleteMany({ where: { id: photoId, jobId, businessId } });
  if (!gone.count) throw new FieldError("Photo not found", 404);
}

export async function addJobNote(params: { businessId: string; jobId: string; body: unknown; authorKind: "technician" | "person"; authorName: string }) {
  await ownJob(params.businessId, params.jobId);
  const body = typeof params.body === "string" ? params.body.trim() : "";
  if (!body) throw new FieldError("Write the note first.");
  if (body.length > 2000) throw new FieldError("Keep a note under 2,000 characters.");
  if (params.authorKind === "technician") {
    // A phone that lost signal mid-send resends the note when it reconnects; the first copy stands.
    const twin = await prisma.jobNote.findFirst({
      where: { businessId: params.businessId, jobId: params.jobId, authorKind: "technician", authorName: params.authorName.slice(0, 120), body, createdAt: { gte: new Date(Date.now() - 6 * 3_600_000) } },
    });
    if (twin) return toNote(twin);
  }
  const row = await prisma.jobNote.create({
    data: { businessId: params.businessId, jobId: params.jobId, authorKind: params.authorKind, authorName: params.authorName.slice(0, 120), body },
  });
  return toNote(row);
}

function toNote(row: { id: string; authorKind: string; authorName: string; body: string; createdAt: Date }): JobNoteView {
  return {
    id: row.id,
    authorKind: row.authorKind === "technician" ? "technician" : "person",
    authorName: row.authorName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function jobNotes(businessId: string, jobId: string) {
  const rows = await prisma.jobNote.findMany({ where: { businessId, jobId }, orderBy: { createdAt: "asc" } });
  return rows.map(toNote);
}

/** Everything done on the job in the field: lines and their total, photos, notes, the checklist and the customer's sign-off. */
export async function jobField(businessId: string, jobId: string) {
  const [lines, photos, notes, job, signed] = await Promise.all([
    jobLines(businessId, jobId),
    jobPhotos(businessId, jobId),
    jobNotes(businessId, jobId),
    prisma.job.findFirst({ where: { id: jobId, businessId }, select: { checklistJson: true, categoryCode: true, title: true, serviceType: true, business: { select: { trade: true } } } }),
    prisma.jobSignature.findFirst({ where: { businessId, jobId }, select: { signerName: true, signedAt: true, agreedCents: true, statement: true } }),
  ]);
  const checklist = job ? readChecklist(job.checklistJson, checklistTemplateFor(job, job.business.trade)) : null;
  const signature = signed ? { ...signed, signedAt: signed.signedAt.toISOString() } : null;
  return { ...lines, photos, notes, checklist, signature };
}

/** Save ticks and readings on the job's checklist, starting it from the template on first use. */
export async function setJobChecklist(businessId: string, jobId: string, changes: unknown) {
  // Two quick ticks arrive as two requests; each applies on top of what the other saved, never over it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const job = await prisma.job.findFirst({ where: { id: jobId, businessId }, select: { id: true, checklistJson: true, categoryCode: true, title: true, serviceType: true, business: { select: { trade: true } } } });
    if (!job) throw new FieldError("Job not found", 404);
    const { json, checklist } = applyChecklist(job.checklistJson, checklistTemplateFor(job, job.business.trade), changes);
    const saved = await prisma.job.updateMany({ where: { id: job.id, checklistJson: job.checklistJson }, data: { checklistJson: json } });
    if (saved.count) return checklist;
  }
  throw new FieldError("Too many changes at once. Try that tick again.", 409);
}

export type PriceBookEntry = { id: string; name: string; kind: LineKind; unitCents: number; description: string | null };

export async function priceBook(businessId: string): Promise<PriceBookEntry[]> {
  const rows = await prisma.priceBookItem.findMany({ where: { businessId, isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, kind: lineKind(r.kind), unitCents: r.unitCents, description: r.description }));
}

/** A price-book entry from a form, or a FieldError saying what to fix. */
export function cleanPriceBookEntry(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) throw new FieldError("Name it first.");
  const unitCents = Number(body.unitCents);
  if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > 5_000_000) throw new FieldError("Price must be between $0 and $50,000.");
  const kind = (LINE_KINDS as readonly string[]).includes(String(body.kind)) ? String(body.kind) : "service";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) || null : null;
  return { name, unitCents, kind, description };
}

/**
 * One history entry per editing burst: a technician tapping a quantity up
 * three times is one change to the work, ending at the last total.
 */
export async function recordLinesChange(params: { businessId: string; jobId: string; actor: AuditActor; actorEmail?: string | null; summary: string }) {
  const recent = await prisma.auditEvent.findFirst({
    where: { businessId: params.businessId, jobId: params.jobId, action: "job.lines", actor: params.actor, actorEmail: params.actorEmail?.toLowerCase() ?? null, createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (recent) {
    await prisma.auditEvent.update({ where: { id: recent.id }, data: { summary: params.summary, createdAt: new Date() } });
    return;
  }
  await recordAudit({ businessId: params.businessId, entityType: "job", entityId: params.jobId, jobId: params.jobId, action: "job.lines", actor: params.actor, actorEmail: params.actorEmail ?? null, summary: params.summary });
}
