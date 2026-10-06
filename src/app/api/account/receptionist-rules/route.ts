import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { addRule, MAX_RULE_CHARS, parseRules, removeRule } from "@/lib/receptionist-rules";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import { requirePermission } from "@/lib/tenant";

const addSchema = z.object({ text: z.string().min(1).max(MAX_RULE_CHARS * 2), callId: z.string().max(64).optional() });

async function saveAndSync(businessId: string, rulesJson: string) {
  const saved = await prisma.business.update({ where: { id: businessId }, data: { receptionistRulesJson: rulesJson } });
  try {
    await syncBusinessAssistant(saved);
    return true;
  } catch (error) {
    logWarn("receptionist_rules.sync_failed", { businessId, error: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

export async function GET() {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  return NextResponse.json({ rules: parseRules(authResult.business.receptionistRulesJson) });
}

/** The owner's correction, followed from the next call on. */
export async function POST(request: Request) {
  const authResult = await requirePermission("settings.edit");
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write what the receptionist should do differently." }, { status: 400 });

  const callId = parsed.data.callId
    ? (await prisma.call.findFirst({ where: { id: parsed.data.callId, businessId: business.id }, select: { id: true } }))?.id
    : undefined;
  const result = addRule(parseRules(business.receptionistRulesJson), parsed.data.text, { callId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const synced = await saveAndSync(business.id, JSON.stringify(result.rules));
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "receptionist_rule.add",
    actor: role === "owner" ? "owner" : "teammate",
    actorEmail: email,
    summary: `${email} corrected the receptionist: “${result.rule.text}”`,
  });
  return NextResponse.json({ rules: result.rules, rule: result.rule, synced });
}

export async function DELETE(request: Request) {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const before = parseRules(business.receptionistRulesJson);
  const rules = removeRule(before, id);
  if (rules.length === before.length) return NextResponse.json({ error: "That correction is already gone." }, { status: 404 });
  const synced = await saveAndSync(business.id, JSON.stringify(rules));
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "receptionist_rule.remove",
    actor: role === "owner" ? "owner" : "teammate",
    actorEmail: email,
    summary: `${email} removed a receptionist correction.`,
  });
  return NextResponse.json({ rules, synced });
}
