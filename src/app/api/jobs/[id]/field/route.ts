import { personActor } from "@/lib/audit";
import { FieldError, jobField, priceBook, recordLinesChange, setJobLines } from "@/lib/job-field";
import { formatCentsExact } from "@/lib/money";
import { withOffice } from "@/lib/office-route";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** The work on a job: lines and their total, photos, notes, and the price book to add from. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async ({ business }) => {
    const job = await prisma.job.findFirst({ where: { id, businessId: business.id }, select: { id: true } });
    if (!job) throw new FieldError("Job not found", 404);
    const [field, book] = await Promise.all([jobField(business.id, id), priceBook(business.id)]);
    return { ...field, priceBook: book };
  });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("jobs", async (session) => {
    const body = (await request.json().catch(() => ({}))) as { lines?: unknown };
    const { lines, totalCents } = await setJobLines(session.business.id, id, body.lines);
    await recordLinesChange({
      businessId: session.business.id,
      jobId: id,
      ...personActor(session),
      summary: `Set the work: ${lines.length} line${lines.length === 1 ? "" : "s"}, ${formatCentsExact(totalCents)}`,
    });
    return { lines, totalCents };
  });
}
