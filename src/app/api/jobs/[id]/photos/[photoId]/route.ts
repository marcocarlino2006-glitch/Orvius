import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { deleteJobPhoto, FieldError, photoFile } from "@/lib/job-field";
import { withOffice } from "@/lib/office-route";

type Params = { params: Promise<{ id: string; photoId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, photoId } = await params;
  return withOffice("jobs", async ({ business }) => {
    const file = await photoFile(business.id, id, photoId);
    if (!file) throw new FieldError("Photo not found", 404);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, photoId } = await params;
  return withOffice("jobs", async (session) => {
    await deleteJobPhoto(session.business.id, id, photoId);
    await recordAudit({ businessId: session.business.id, entityType: "job", entityId: id, jobId: id, action: "job.photo_removed", ...personActor(session), summary: "Removed a photo" });
    return { ok: true };
  });
}
