import { personActor, recordAudit } from "@/lib/audit";
import { addJobPhoto, FieldError, MAX_PHOTO_BYTES } from "@/lib/job-field";
import { withOffice } from "@/lib/office-route";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async (session) => {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES + 64_000) throw new FieldError("That photo is too large.", 413);
    const form = await request.formData().catch(() => null);
    const file = form?.get("photo");
    if (!(file instanceof Blob)) throw new FieldError("Attach the photo.");
    const photo = await addJobPhoto({
      businessId: session.business.id,
      jobId: id,
      bytes: new Uint8Array(await file.arrayBuffer()),
      kind: String(form?.get("kind") ?? "other"),
      caption: form?.get("caption") ? String(form.get("caption")) : null,
      width: Number(form?.get("width")) || null,
      height: Number(form?.get("height")) || null,
      takenBy: session.email,
    });
    await recordAudit({ businessId: session.business.id, entityType: "job", entityId: id, jobId: id, action: "job.photo", ...personActor(session), summary: "Added a photo", detail: { photoId: photo.id } });
    return { photo };
  });
}
