import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHECK_MS = 3_000;
/** Serverless functions are capped; the browser's EventSource reconnects on its own. */
const STREAM_MS = 50_000;

async function shopVersion(businessId: string) {
  const where = { businessId };
  const [call, lead, job, alert] = await Promise.all([
    prisma.call.aggregate({ where, _max: { updatedAt: true } }),
    prisma.lead.aggregate({ where, _max: { updatedAt: true } }),
    prisma.job.aggregate({ where, _max: { updatedAt: true } }),
    prisma.ownerNotification.aggregate({ where, _max: { processedAt: true, createdAt: true } }),
  ]);
  return [
    call._max.updatedAt,
    lead._max.updatedAt,
    job._max.updatedAt,
    alert._max.processedAt,
    alert._max.createdAt,
  ]
    .map((at) => at?.getTime() ?? 0)
    .join(".");
}

/**
 * Tells Command the moment a call, lead, job or alert changes, so a booked
 * job shows up while the owner is looking instead of on the next poll.
 * It only says "something changed"; the page refetches what it shows.
 */
export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const businessId = authResult.business.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(stop);
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };

      let version = await shopVersion(businessId).catch(() => "");
      send(`retry: 2000\nevent: ready\ndata: ${version}\n\n`);

      const timer = setInterval(async () => {
        const next = await shopVersion(businessId).catch(() => version);
        if (next !== version) {
          version = next;
          send(`event: change\ndata: ${next}\n\n`);
        } else {
          send(`: keep-alive\n\n`);
        }
      }, CHECK_MS);
      const stop = setTimeout(close, STREAM_MS);
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
