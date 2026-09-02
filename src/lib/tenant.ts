import { auth } from "@/auth";
import { getBusinessForOwnerWithAutoLine } from "@/lib/provision-business";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/env";
import { NextResponse } from "next/server";
import type { Business } from "@prisma/client";

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function noBusinessResponse() {
  return NextResponse.json({ error: "No shop linked to this account" }, { status: 404 });
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

  const business = await getBusinessForOwnerWithAutoLine(email);

  if (!business) {
    return { error: noBusinessResponse() };
  }

  return { session, email, business };
}

export function belongsToBusiness(
  resource: { businessId: string | null } | null,
  business: Pick<Business, "id">,
) {
  return Boolean(resource && resource.businessId === business.id);
}
