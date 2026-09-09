import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type PublicStatus = {
  status: "operational" | "degraded";
  checkedAt: string;
};

/**
 * Cheap public liveness for the header status pill. Deliberately not
 * /api/health: that endpoint runs four table counts and returns config detail,
 * which is far too much work to hang off every marketing page view. This is one
 * round trip, cached at the edge for a minute so a burst of visitors costs one
 * query.
 *
 * "Operational" means exactly one thing here — the app is serving and the
 * record store is reachable, so an inbound call can still be written down.
 * Credential coverage is a deploy-time question and stays in /api/health and
 * `npm run standard:check`; a public badge that flipped red over a missing
 * optional key would be noise, not status.
 */
export async function GET() {
  let databaseUp = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseUp = true;
  } catch {
    databaseUp = false;
  }

  const body: PublicStatus = {
    status: databaseUp ? "operational" : "degraded",
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
