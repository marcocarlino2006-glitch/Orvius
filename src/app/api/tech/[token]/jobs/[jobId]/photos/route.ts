import { recordAudit } from "@/lib/audit";
import { addJobPhoto, FieldError, MAX_PHOTO_BYTES } from "@/lib/job-field";
import { prisma } from "@/lib/prisma";
import { withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => {
    const own = await prisma.job.findFirst({ where: { id: jobId, businessId: tech.businessId, technicianId: tech.id }, select: { id: true } });
    if (!own) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES + 64_000) throw new FieldError("That photo is too large. Take it again from the app.", 413);
    const form = await request.formData().catch(() => null);
    const file = form?.get("photo");
    if (!(file instanceof Blob)) throw new FieldError("Attach the photo.");
    const photo = await addJobPhoto({
      businessId: tech.businessId,
      jobId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      kind: String(form?.get("kind") ?? "other"),
      caption: form?.get("caption") ? String(form.get("caption")) : null,
      width: Number(form?.get("width")) || null,
      height: Number(form?.get("height")) || null,
      takenBy: tech.name,
      technicianId: tech.id,
    });
    await recordAudit({
      businessId: tech.businessId,
      entityType: "job",
      entityId: jobId,
      jobId,
      action: "job.photo",
      actor: "technician",
      summary: `${tech.name} added a ${photo.kind === "other" ? "" : `${photo.kind} `}photo`,
      detail: { photoId: photo.id },
    });
    return { photo };
  });
}
