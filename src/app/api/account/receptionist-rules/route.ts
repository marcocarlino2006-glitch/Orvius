import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { addRule, MAX_RULE_CHARS, parseRules, removeRule } from "@/lib/receptionist-rules";
import { applyReceptionistSettings, receptionistApplyStatus, type ReceptionistApply } from "@/lib/assistant-apply";
import { requirePermission } from "@/lib/tenant";

const addSchema = z.object({ text: z.string().min(1).max(MAX_RULE_CHARS * 2), callId: z.string().max(64).optional() });

const CHANGED_ELSEWHERE = "The corrections changed in another window. Reopen them and try again.";

/**
 * Saved first, and only over the list this request read, so two windows can't
 * silently undo each other; `synced` is true only when the provider confirmed
 * the receptionist took this version.
 */
async function saveAndSync(businessId: string, readJson: string, rulesJson: string, by: { actor: "owner" | "teammate"; email: string }) {
  const swapped = await prisma.business.updateMany({ where: { id: businessId, receptionistRulesJson: readJson }, data: { receptionistRulesJson: rulesJson } });
  if (!swapped.count) return null;
  const saved = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
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
  const before = parseRules(business.receptionistRulesJson);
  const result = addRule(before, parsed.data.text, { callId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.rules === before) {
    // Already on the list (a repeated press): nothing is written, and the reply says where the receptionist stands.
    const receptionistApply = await receptionistApplyStatus(business);
    return NextResponse.json({ rules: before, rule: result.rule, synced: receptionistApply.state === "applied", receptionistApply, unchanged: true });
  }
  const outcome = await saveAndSync(business.id, business.receptionistRulesJson, JSON.stringify(result.rules), { actor: role === "owner" ? "owner" : "teammate", email });
  if (!outcome) return NextResponse.json({ error: CHANGED_ELSEWHERE, reason: "changed_elsewhere" }, { status: 409 });
  const { synced, receptionistApply } = outcome;
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
  const outcome = await saveAndSync(business.id, business.receptionistRulesJson, JSON.stringify(rules), { actor: role === "owner" ? "owner" : "teammate", email });
  if (!outcome) return NextResponse.json({ error: CHANGED_ELSEWHERE, reason: "changed_elsewhere" }, { status: 409 });
  const { synced, receptionistApply } = outcome;
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
