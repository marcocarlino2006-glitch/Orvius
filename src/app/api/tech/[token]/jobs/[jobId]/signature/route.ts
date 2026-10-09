import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { FieldError } from "@/lib/job-field";
import { saveJobSignature, signatureFile } from "@/lib/job-signature";
import { prisma } from "@/lib/prisma";
import { readJson, withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string }> };

async function ownJob(businessId: string, technicianId: string, jobId: string) {
  const own = await prisma.job.findFirst({ where: { id: jobId, businessId, technicianId }, select: { id: true } });
  if (!own) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
}

export async function GET(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => {
    await ownJob(tech.businessId, tech.id, jobId);
    const file = await signatureFile(tech.businessId, jobId);
    if (!file) throw new FieldError("Not signed yet", 404);
    return new NextResponse(Buffer.from(file.png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  });
}

/** The customer's sign-off on the work and total, drawn on this phone. */
export async function POST(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => {
    await ownJob(tech.businessId, tech.id, jobId);
    const body = await readJson(request);
    const { signature, created } = await saveJobSignature({ businessId: tech.businessId, jobId, technicianId: tech.id, name: body.name, image: body.image, replace: body.replace });
    if (created) {
      await recordAudit({
        businessId: tech.businessId,
        entityType: "job",
        entityId: jobId,
        jobId,
        action: "job.signed",
        actor: "technician",
        summary: `${signature.signerName} signed off on the work with ${tech.name}`,
        detail: { agreedCents: signature.agreedCents },
      });
    }
    return { signature };
  });
}
