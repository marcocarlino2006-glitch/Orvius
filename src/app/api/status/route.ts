import { NextResponse } from "next/server";
import { scheduleBackstop } from "@/lib/cron-backstop";
import { lateCrons } from "@/lib/cron-runs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
/* Room for a late sweep picked up after the response (cron-backstop.ts). */
export const maxDuration = 60;

export type PublicStatus = {
  status: "operational" | "degraded";
  /*
    What the word above is a claim about.

    The badge renders "OPERATIONAL", and a shop owner reads that as "my calls
    are being answered" — which this endpoint has not checked and cannot. Voice
    does not pass through this app at all. Shipping the scope alongside the
    verdict is what keeps a green badge from being a promise about the phone.
  */
  scope: string;
  /** Whether the background sweeps (owner-alert retries, lost-call recovery) are keeping their schedule. */
  sweeps: "on_time" | "late" | "unknown";
  /**
   * Whether the database answers from the functions' own region. Every call
   * turn reads the shop, so a database in another region adds its round trip
   * to what the caller hears as silence; "far" means the two were placed apart.
   */
  database: "near" | "far" | "unknown";
  checkedAt: string;
};

const SCOPE_COPY = {
  operational: "Orvius app and records are reachable. Live line status is on your dashboard.",
  degraded: "Orvius app is not fully reachable. Inbound calls are answered by the voice line, not this app.",
} as const;

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
/* Same-region Turso answers in single-digit milliseconds; across the country it is 60ms or more. */
const FAR_ROUND_TRIP_MS = 40;

export async function GET() {
  let databaseUp = false;
  let fastestMs = Infinity;
  try {
    // The first ping pays for the connection, so the fastest of three is the round trip itself.
    for (let i = 0; i < 3; i += 1) {
      const sent = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      fastestMs = Math.min(fastestMs, performance.now() - sent);
    }
    databaseUp = true;
  } catch {
    databaseUp = false;
  }

  const sweeps: PublicStatus["sweeps"] = databaseUp
    ? await lateCrons()
        .then((late) => (late.length ? "late" : "on_time"))
        .catch(() => "unknown" as const)
    : "unknown";

  if (sweeps === "late") scheduleBackstop("status");

  const status = databaseUp ? "operational" : "degraded";
  const body: PublicStatus = {
    status,
    scope: SCOPE_COPY[status],
    sweeps,
    database: databaseUp ? (fastestMs > FAR_ROUND_TRIP_MS ? "far" : "near") : "unknown",
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
