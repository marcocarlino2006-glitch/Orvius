import { recordLinesChange, setJobLines } from "@/lib/job-field";
import { formatCentsExact } from "@/lib/money";
import { techJobDetail } from "@/lib/tech-app";
import { readJson, withTech } from "@/lib/tech-route";
import { prisma } from "@/lib/prisma";
import { FieldError } from "@/lib/job-field";

type Params = { params: Promise<{ token: string; jobId: string }> };

/** Replace the work on the job; the job is billed the new total. */
export async function PUT(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => {
    const own = await prisma.job.findFirst({ where: { id: jobId, businessId: tech.businessId, technicianId: tech.id }, select: { id: true } });
    if (!own) throw new FieldError("This job isn't on your list anymore. Ask the office.", 404);
    const { lines, totalCents } = await setJobLines(tech.businessId, jobId, (await readJson(request)).lines);
    await recordLinesChange({
      businessId: tech.businessId,
      jobId,
      actor: "technician",
      summary: `${tech.name} set the work: ${lines.length} line${lines.length === 1 ? "" : "s"}, ${formatCentsExact(totalCents)}`,
    });
    return techJobDetail(tech, jobId);
  });
}
