import { recordAudit } from "@/lib/audit";
import { addJobNote, FieldError } from "@/lib/job-field";
import { prisma } from "@/lib/prisma";
import { readJson, withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => {
    const own = await prisma.job.findFirst({ where: { id: jobId, businessId: tech.businessId, technicianId: tech.id }, select: { id: true } });
    if (!own) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
    const note = await addJobNote({ businessId: tech.businessId, jobId, body: (await readJson(request)).body, authorKind: "technician", authorName: tech.name });
    await recordAudit({ businessId: tech.businessId, entityType: "job", entityId: jobId, jobId, action: "job.note", actor: "technician", summary: `${tech.name} added a note`, detail: { noteId: note.id } });
    return { note };
  });
}
