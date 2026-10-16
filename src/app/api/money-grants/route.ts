import { NextResponse } from "next/server";
import { FINANCIAL_POLICY_VERSION, FINANCIAL_SCOPES, FinancialGrantError, grantMoneyAuthority, listMoneyGrants, revokeMoneyAuthority } from "@/lib/money-authority";
import { requirePermission } from "@/lib/tenant";

/* Money grants: the owner alone issues and revokes them; each covers one kind of money action. */

export async function GET() {
  const owner = await requirePermission("money.adjust", { entitled: false });
  if ("error" in owner) return owner.error;
  const grants = await listMoneyGrants(owner.business.id);
  return NextResponse.json({
    policyVersion: FINANCIAL_POLICY_VERSION,
    scopes: FINANCIAL_SCOPES,
    grants: grants.map((g) => ({
      id: g.id,
      granteeEmail: g.granteeEmail,
      scope: g.scope,
      maxCents: g.maxCents,
      expiresAt: g.expiresAt.toISOString(),
      policyVersion: g.policyVersion,
      grantedBy: g.grantedByEmail,
      revokedAt: g.revokedAt?.toISOString() ?? null,
      active: g.active,
    })),
  });
}

export async function POST(request: Request) {
  const owner = await requirePermission("money.adjust");
  if ("error" in owner) return owner.error;
  const body = (await request.json().catch(() => null)) as { granteeEmail?: unknown; scope?: unknown; maxCents?: unknown; days?: unknown } | null;
  if (typeof body?.granteeEmail !== "string" || typeof body.scope !== "string" || typeof body.days !== "number") {
    return NextResponse.json({ error: "Name the teammate, the money action and how many days." }, { status: 400 });
  }
  if (body.granteeEmail.trim().toLowerCase() === owner.email) return NextResponse.json({ error: "The owner already holds every money right." }, { status: 400 });
  try {
    const grant = await grantMoneyAuthority({
      businessId: owner.business.id,
      ownerEmail: owner.email,
      granteeEmail: body.granteeEmail,
      scope: body.scope,
      maxCents: typeof body.maxCents === "number" ? body.maxCents : null,
      days: body.days,
    });
    return NextResponse.json({ ok: true, grantId: grant.id });
  } catch (error) {
    if (error instanceof FinancialGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const owner = await requirePermission("money.adjust");
  if ("error" in owner) return owner.error;
  try {
    await revokeMoneyAuthority({ businessId: owner.business.id, ownerEmail: owner.email, grantId: new URL(request.url).searchParams.get("id") ?? "" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FinancialGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
