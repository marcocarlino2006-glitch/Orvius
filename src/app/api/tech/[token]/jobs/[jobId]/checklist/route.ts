import { recordAudit } from "@/lib/audit";
import { FieldError, setJobChecklist } from "@/lib/job-field";
import { prisma } from "@/lib/prisma";
import { readJson, withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string }> };

/** Ticks and readings from the field; the same change sent twice lands once. */
export async function PUT(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => {
    const own = await prisma.job.findFirst({ where: { id: jobId, businessId: tech.businessId, technicianId: tech.id }, select: { id: true } });
    if (!own) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
    const before = await prisma.job.findUnique({ where: { id: jobId }, select: { checklistJson: true } });
    const checklist = await setJobChecklist(tech.businessId, jobId, (await readJson(request)).items);
    if (!before?.checklistJson) {
      await recordAudit({ businessId: tech.businessId, entityType: "job", entityId: jobId, jobId, action: "job.checklist", actor: "technician", summary: `${tech.name} started the ${checklist.title.toLowerCase()} checklist` });
    }
    return { checklist };
  });
}
