import { auth } from "@/auth";
import { requireActiveBilling } from "@/lib/plan-gate";
import { getShopAccessWithAutoLine } from "@/lib/provision-business";
import { can, type Permission } from "@/lib/workspace-access";
import { verifyAdminRequest } from "@/lib/env";
import { NextResponse } from "next/server";
import type { Business } from "@prisma/client";

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function noBusinessResponse() {
  return NextResponse.json(
    { error: "No shop linked to this account" },
    { status: 404 },
  );
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function requireAdmin(request: Request) {
  if (!verifyAdminRequest(request)) {
    return { error: unauthorizedResponse() };
  }
  return { ok: true as const };
}

export async function requireBusinessSession() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return { error: unauthorizedResponse() };
  }

  const access = await getShopAccessWithAutoLine(email);

  if (!access) {
    return { error: noBusinessResponse() };
  }

  return { session, email, business: access.business, role: access.role };
}

export function roleForbiddenResponse(permission: Permission) {
  const what: Record<Permission, string> = {
    "settings.edit": "change settings",
    "team.manage": "manage the team",
    "data.export": "export shop data",
    "billing.manage": "manage billing",
    "workspace.delete": "delete the workspace",
  };
  return NextResponse.json({ error: `Your role can't ${what[permission]}. Ask the shop owner.` }, { status: 403 });
}

/** Auth plus a role check, for routes only some teammates may use. */
export async function requirePermission(permission: Permission, options: { entitled?: boolean } = {}) {
  const authResult = options.entitled === false ? await requireBusinessSession() : await requireEntitledSession();
  if ("error" in authResult) return authResult;
  if (!can(authResult.role, permission)) return { error: roleForbiddenResponse(permission) };
  return authResult;
}

/** Auth + active billing — blocks expired pilot / canceled shops. */
export async function requireEntitledSession() {
  const authResult = await requireBusinessSession();
  if ("error" in authResult) return authResult;
  const billing = requireActiveBilling(authResult.business);
  if ("error" in billing) return { error: billing.error };
  return authResult;
}

export function belongsToBusiness(
  resource: { businessId: string | null } | null,
  business: Pick<Business, "id">,
) {
  return Boolean(resource && resource.businessId === business.id);
}
