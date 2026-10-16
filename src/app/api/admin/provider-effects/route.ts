import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/env";
import { stuckEffects } from "@/lib/provider-effect";

/** Stripe and Vapi effects that need a person, including those made before a shop existed (no owner to show them to). */
export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const effects = await stuckEffects({ olderThanMs: 5 * 60_000 });
  return NextResponse.json({
    count: effects.length,
    effects: effects.map((e) => ({
      id: e.id,
      businessId: e.businessId,
      provider: e.provider,
      operation: e.operation,
      correlationKey: e.correlationKey,
      idempotencyKey: e.idempotencyKey,
      status: e.status,
      providerId: e.providerId,
      attempts: e.attempts,
      lastError: e.lastError,
      exceptionId: e.exceptionId,
      updatedAt: e.updatedAt,
    })),
  });
}
