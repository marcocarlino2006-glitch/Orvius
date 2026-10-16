import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { addRule, MAX_RULE_CHARS, parseRules, removeRule } from "@/lib/receptionist-rules";
import { applyReceptionistSettings, type ReceptionistApply } from "@/lib/assistant-apply";
import { requirePermission } from "@/lib/tenant";

const addSchema = z.object({ text: z.string().min(1).max(MAX_RULE_CHARS * 2), callId: z.string().max(64).optional() });

/** Saved first; `synced` is true only when the provider confirmed the receptionist took this version. */
async function saveAndSync(businessId: string, rulesJson: string, by: { actor: "owner" | "teammate"; email: string }) {
  const saved = await prisma.business.update({ where: { id: businessId }, data: { receptionistRulesJson: rulesJson } });
  const receptionistApply = await applyReceptionistSettings(saved, by).catch((error: unknown): ReceptionistApply => {
    logWarn("receptionist_rules.sync_failed", { businessId, error: error instanceof Error ? error.message : "unknown" });
    return { state: "unconfirmed", appliedAt: null, error: null, next: "Saved, but Orvius couldn't check the receptionist. Apply it again from Settings.", canApply: true };
  });
  return { synced: receptionistApply.state === "applied", receptionistApply };
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

  const { synced, receptionistApply } = await saveAndSync(business.id, JSON.stringify(result.rules), { actor: role === "owner" ? "owner" : "teammate", email });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "receptionist_rule.add",
    actor: role === "owner" ? "owner" : "teammate",
    actorEmail: email,
    summary: `${email} corrected the receptionist: “${result.rule.text}”`,
  });
  return NextResponse.json({ rules: result.rules, rule: result.rule, synced, receptionistApply });
}

export async function DELETE(request: Request) {
  const authResult = await requirePermission("settings.edit", { entitled: false });
  if ("error" in authResult) return authResult.error;
  const { business, email, role } = authResult;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const before = parseRules(business.receptionistRulesJson);
  const rules = removeRule(before, id);
  if (rules.length === before.length) return NextResponse.json({ error: "That correction is already gone." }, { status: 404 });
  const { synced, receptionistApply } = await saveAndSync(business.id, JSON.stringify(rules), { actor: role === "owner" ? "owner" : "teammate", email });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "receptionist_rule.remove",
    actor: role === "owner" ? "owner" : "teammate",
    actorEmail: email,
    summary: `${email} removed a receptionist correction.`,
  });
  return NextResponse.json({ rules, synced, receptionistApply });
}
