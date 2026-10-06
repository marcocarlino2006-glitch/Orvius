import { NextResponse } from "next/server";
import { FieldError, photoFile } from "@/lib/job-field";
import { prisma } from "@/lib/prisma";
import { withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string; photoId: string }> };

async function ownJob(tech: { id: string; businessId: string }, jobId: string) {
  const own = await prisma.job.findFirst({ where: { id: jobId, businessId: tech.businessId, technicianId: tech.id }, select: { id: true } });
  if (!own) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
}

export async function GET(request: Request, { params }: Params) {
  const { token, jobId, photoId } = await params;
  return withTech(request, token, async (tech) => {
    await ownJob(tech, jobId);
    const file = await photoFile(tech.businessId, jobId, photoId);
    if (!file) throw new FieldError("Photo not found", 404);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  });
}

/** A technician can take back a photo they took. */
export async function DELETE(request: Request, { params }: Params) {
  const { token, jobId, photoId } = await params;
  return withTech(request, token, async (tech) => {
    await ownJob(tech, jobId);
    const gone = await prisma.jobPhoto.deleteMany({ where: { id: photoId, jobId, businessId: tech.businessId, technicianId: tech.id } });
    if (!gone.count) throw new FieldError("You can only remove photos you took.", 404);
    return { ok: true };
  });
}
