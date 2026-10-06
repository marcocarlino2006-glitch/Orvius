import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";
import { getWorkItem, workAssignees } from "@/lib/work";
import { workHistory } from "@/lib/work-history";

/** One request or job: its stage, problems, next step and everything that happened to it. */
export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "job" ? "job" : "request";
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Which work?" }, { status: 400 });

  const item = await getWorkItem(business.id, kind, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [history, assignees, technicians] = await Promise.all([
    workHistory(business.id, { kind: item.kind, id: item.id }),
    workAssignees(business),
    prisma.technician.findMany({ where: { businessId: business.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ item, history: history ?? [], assignees, technicians });
}
