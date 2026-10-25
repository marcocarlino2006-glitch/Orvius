import { NextResponse } from "next/server";
import { z } from "zod";
import { personActor } from "@/lib/audit";
import { PastVisitError, recordPastVisit } from "@/lib/past-visit";
import { requirePlanModule } from "@/lib/plan-gate";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  title: z.string().min(1).max(120),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const customers = requirePlanModule(business, "customers");
  if ("error" in customers) return customers.error;
  const jobs = requirePlanModule(business, "jobs");
  if ("error" in jobs) return jobs.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Say what the visit was, and the day it happened." }, { status: 400 });
  }

  try {
    const job = await recordPastVisit({
      businessId: business.id,
      customerId: id,
      title: parsed.data.title,
      day: parsed.data.day,
      notes: parsed.data.notes,
      actor: personActor(authResult),
    });
    return NextResponse.json({
      job: { id: job.id, title: job.title, at: job.scheduledAt?.toISOString() ?? null },
    });
  } catch (error) {
    if (error instanceof PastVisitError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
