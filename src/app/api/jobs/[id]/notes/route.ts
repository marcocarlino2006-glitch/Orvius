import { personActor, recordAudit } from "@/lib/audit";
import { addJobNote } from "@/lib/job-field";
import { withOffice } from "@/lib/office-route";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async (session) => {
    const body = (await request.json().catch(() => ({}))) as { body?: unknown };
    const note = await addJobNote({ businessId: session.business.id, jobId: id, body: body.body, authorKind: "person", authorName: session.email });
    await recordAudit({ businessId: session.business.id, entityType: "job", entityId: id, jobId: id, action: "job.note", ...personActor(session), summary: "Added a note", detail: { noteId: note.id } });
    return { note };
  });
}
