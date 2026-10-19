import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  RECORD_CONTRACT_VERSION,
  RECORD_DOMAINS,
  RECORD_SYSTEMS,
  RecordContractError,
  getRecordContract,
  resolveReconciliation,
  setRecordContract,
} from "@/lib/system-of-record";
import { requireMoney } from "@/lib/money-authority";
import { requirePermission } from "@/lib/tenant";

export async function GET() {
  const auth = await requirePermission("settings.edit", { entitled: false });
  if ("error" in auth) return auth.error;
  const [contract, open] = await Promise.all([
    getRecordContract(auth.business.id),
    prisma.reconciliationException.findMany({
      where: { businessId: auth.business.id, status: "open" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, kind: true, entityType: true, entityId: true, system: true, externalId: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({ rulesVersion: RECORD_CONTRACT_VERSION, domains: RECORD_DOMAINS, systems: RECORD_SYSTEMS, contract, openExceptions: open, canEdit: auth.role === "owner" });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.edit");
  if ("error" in auth) return auth.error;
  if (auth.role !== "owner") return NextResponse.json({ error: "Only the owner decides which system is the record of truth." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { domains?: unknown; replicas?: unknown } | null;
  try {
    const saved = await setRecordContract({ businessId: auth.business.id, domains: body?.domains, replicas: body?.replicas, actorEmail: auth.email });
    return NextResponse.json({ rulesVersion: RECORD_CONTRACT_VERSION, contract: saved });
  } catch (error) {
    if (error instanceof RecordContractError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** Resolve one reconciliation exception, with what was done about it. */
export async function POST(request: Request) {
  const auth = await requirePermission("settings.edit");
  if ("error" in auth) return auth.error;
  if (auth.role !== "owner" && auth.role !== "manager") return NextResponse.json({ error: "Only the owner or a manager resolves these." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; resolution?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.resolution !== "string") return NextResponse.json({ error: "Say which exception and how it was resolved." }, { status: 422 });
  const exception = await prisma.reconciliationException.findFirst({ where: { id: body.id, businessId: auth.business.id }, select: { kind: true, entityType: true, entityId: true } });
  if (exception?.kind === "payment") {
    const money = await requireMoney({ businessId: auth.business.id, role: auth.role, email: auth.email }, "resolve_payment", { entityType: exception.entityType, entityId: exception.entityId });
    if ("error" in money) return money.error;
  }
  try {
    await resolveReconciliation({ businessId: auth.business.id, id: body.id, actorEmail: auth.email, resolution: body.resolution });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecordContractError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
