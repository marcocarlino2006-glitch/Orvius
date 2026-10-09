import { FieldError, jobLines } from "@/lib/job-field";
import { signatureStatement } from "@/lib/job-signature-text";
import { prisma } from "@/lib/prisma";

/* A finger-drawn PNG at phone width is 10–40 KB; anything far bigger was not drawn in the app. */
export const MAX_SIGNATURE_BYTES = 200_000;

export type JobSignatureView = { signerName: string; signedAt: string; agreedCents: number | null; statement: string };

export { signatureStatement };

function pngFromDataUrl(input: unknown) {
  const m = typeof input === "string" ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input) : null;
  if (!m) throw new FieldError("Have the customer sign in the box first.");
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new FieldError("That signature is too large. Clear it and sign again.", 413);
  const png = bytes.length > 12 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!png) throw new FieldError("Have the customer sign in the box first.");
  return bytes;
}

function toView(row: { signerName: string; signedAt: Date; agreedCents: number | null; statement: string }): JobSignatureView {
  return { signerName: row.signerName, signedAt: row.signedAt.toISOString(), agreedCents: row.agreedCents, statement: row.statement };
}

export async function signatureFile(businessId: string, jobId: string) {
  return prisma.jobSignature.findFirst({ where: { businessId, jobId }, select: { png: true } });
}

/**
 * The customer signs for the work and total on screen right now. A second
 * send of the same sign-off (an offline phone catching up) returns the first
 * one; signing again over it takes an explicit replace.
 */
export async function saveJobSignature(params: { businessId: string; jobId: string; technicianId: string | null; name: unknown; image: unknown; replace?: unknown }) {
  const job = await prisma.job.findFirst({ where: { id: params.jobId, businessId: params.businessId }, select: { id: true, status: true, finalAmountCents: true } });
  if (!job) throw new FieldError("Job not found", 404);
  if (job.status === "cancelled") throw new FieldError("This job was cancelled.", 409);
  const signerName = typeof params.name === "string" ? params.name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!signerName) throw new FieldError("Type the customer's name under the signature.");
  const png = pngFromDataUrl(params.image);
  const existing = await prisma.jobSignature.findUnique({ where: { jobId: job.id }, select: { signerName: true, signedAt: true, agreedCents: true, statement: true } });
  if (existing && params.replace !== true) return { signature: toView(existing), created: false };
  const lines = await jobLines(params.businessId, job.id);
  const agreedCents = lines.lines.length ? lines.totalCents : job.finalAmountCents;
  const data = {
    businessId: params.businessId,
    jobId: job.id,
    signerName,
    png,
    sizeBytes: png.length,
    agreedCents,
    statement: signatureStatement(agreedCents),
    technicianId: params.technicianId,
    signedAt: new Date(),
  };
  const row = await prisma.jobSignature.upsert({
    where: { jobId: job.id },
    create: data,
    update: data,
    select: { signerName: true, signedAt: true, agreedCents: true, statement: true },
  });
  return { signature: toView(row), created: true };
}
