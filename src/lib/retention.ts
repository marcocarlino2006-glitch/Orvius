import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/twilio-client";
import { deleteVapiCall } from "@/lib/vapi";

/*
  Call recordings and transcripts are kept 24 months, then deleted — ours and
  the copies Vapi and Twilio hold, which is what the privacy page promises.
  The call row, its summary and the lead stay: they are the shop's job
  history, not the recording of a customer's voice.

  A call is only stamped purged once the remote copy is confirmed gone, so a
  Vapi or Twilio outage means tomorrow's run tries it again rather than
  leaving a recording behind that we have told the customer is deleted.
*/

export const CALL_CONTENT_RETENTION_MONTHS = 24;
const BATCH = 200;
const REMOTE_CONCURRENCY = 8;
const RECORDING_SID = /\/Recordings\/(RE[0-9a-f]{32})/gi;
const VOICEMAIL_LINE = /^(Voicemail \(\d+s\)): \S*\/Recordings\/RE[0-9a-f]{32}\S*$/gim;

export function callContentCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - CALL_CONTENT_RETENTION_MONTHS);
  return cutoff;
}

type RemoteDelete = (id: string) => Promise<"deleted" | "missing">;

async function deleteTwilioRecording(sid: string): Promise<"deleted" | "missing"> {
  try {
    await getTwilioClient().recordings(sid).remove();
    return "deleted";
  } catch (error) {
    if ((error as { status?: number }).status === 404) return "missing";
    throw error;
  }
}

type Keyset = { createdAt: Date; id: string };

/* Keyset paging by hand: a Prisma cursor anchors on a row this run has just
   purged, which then falls outside the filter and makes `skip: 1` drop a live
   row instead. */
function after(last: Keyset | undefined) {
  return last
    ? { OR: [{ createdAt: { gt: last.createdAt } }, { createdAt: last.createdAt, id: { gt: last.id } }] }
    : {};
}

async function inParallel<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(run));
  }
}

/*
  Paged by position, not by "still unpurged", so a call whose remote delete keeps
  failing is passed over until tomorrow instead of being fetched again in a
  loop. Remote deletes run a few at a time and the run stops at its budget:
  a single batch a day falls behind for good once a day's calls outnumber it.
*/
export async function purgeExpiredCallContent(
  options: {
    now?: Date;
    deleteVapi?: RemoteDelete | null;
    deleteTwilio?: RemoteDelete | null;
    budgetMs?: number;
  } = {},
) {
  const now = options.now ?? new Date();
  const cutoff = callContentCutoff(now);
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 20_000;
  const outOfTime = () => Date.now() - startedAt > budgetMs;
  const deleteVapi =
    options.deleteVapi !== undefined ? options.deleteVapi : process.env.VAPI_API_KEY ? deleteVapiCall : null;
  const deleteTwilio =
    options.deleteTwilio !== undefined
      ? options.deleteTwilio
      : process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? deleteTwilioRecording
        : null;

  let purged = 0;
  let remotePending = 0;
  let lastCall: Keyset | undefined;
  while (!outOfTime()) {
    const calls = await prisma.call.findMany({
      where: { createdAt: { lt: cutoff }, contentPurgedAt: null, ...after(lastCall) },
      select: { id: true, vapiCallId: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
    });
    if (!calls.length) break;
    lastCall = calls[calls.length - 1]!;

    await inParallel(calls, REMOTE_CONCURRENCY, async (call) => {
      let remoteGone = !call.vapiCallId;
      if (call.vapiCallId && deleteVapi) {
        try {
          await deleteVapi(call.vapiCallId);
          remoteGone = true;
        } catch (error) {
          logWarn("retention.vapi_delete_failed", {
            callId: call.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await prisma.call.update({
        where: { id: call.id },
        data: { transcript: null, recordingUrl: null, ...(remoteGone ? { contentPurgedAt: now } : {}) },
      });
      if (remoteGone) purged += 1;
      else remotePending += 1;
    });
    if (calls.length < BATCH) break;
  }

  let voicemailsPurged = 0;
  let lastLead: Keyset | undefined;
  while (!outOfTime()) {
    const voicemails = await prisma.lead.findMany({
      where: { createdAt: { lt: cutoff }, notes: { contains: "/Recordings/RE" }, ...after(lastLead) },
      select: { id: true, notes: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
    });
    if (!voicemails.length) break;
    lastLead = voicemails[voicemails.length - 1]!;

    await inParallel(voicemails, REMOTE_CONCURRENCY, async (lead) => {
      const notes = lead.notes ?? "";
      const sids = [...new Set([...notes.matchAll(RECORDING_SID)].map((m) => m[1]!))];
      if (!deleteTwilio) {
        remotePending += 1;
        return;
      }
      try {
        for (const sid of sids) await deleteTwilio(sid);
      } catch (error) {
        remotePending += 1;
        logWarn("retention.twilio_delete_failed", {
          leadId: lead.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          notes: notes
            .replace(VOICEMAIL_LINE, `$1: deleted after ${CALL_CONTENT_RETENTION_MONTHS} months`)
            .replace(RECORDING_SID, "/Recordings/deleted"),
        },
      });
      voicemailsPurged += 1;
    });
    if (voicemails.length < BATCH) break;
  }

  if (purged || voicemailsPurged || remotePending) {
    logInfo("retention.call_content_purged", { purged, voicemailsPurged, remotePending, cutoff: cutoff.toISOString() });
  }
  return { purged, voicemailsPurged, remotePending, finished: !outOfTime() };
}

/*
  Operational logs are not kept forever. Every provider retries a webhook
  within days, so a 90-day-old dedupe row guards nothing; a delivered or
  dead alert is history after 180 days. The once-per-shop alert keys stay:
  dropping setup:* would send the forwarding nudge again, and dropping a sent
  test-alert:* would un-prove the shop's alert path in the readiness check.
  AuditEvent is the shop's record of what was decided and is not pruned.
*/
export const WEBHOOK_EVENT_RETENTION_DAYS = 90;
export const OWNER_NOTIFICATION_RETENTION_DAYS = 180;
const PRUNE_CHUNK = 1000;
const DAY_MS = 86_400_000;

async function pruneInChunks(
  outOfTime: () => boolean,
  findIds: () => Promise<Array<{ id: string }>>,
  remove: (ids: string[]) => Promise<{ count: number }>,
) {
  let removed = 0;
  while (!outOfTime()) {
    const ids = (await findIds()).map((row) => row.id);
    if (!ids.length) return { removed, finished: true };
    removed += (await remove(ids)).count;
    if (ids.length < PRUNE_CHUNK) return { removed, finished: true };
  }
  return { removed, finished: false };
}

export async function pruneOperationalLogs(options: { now?: Date; budgetMs?: number } = {}) {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 10_000;
  const outOfTime = () => Date.now() - startedAt > budgetMs;

  const webhookCutoff = new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * DAY_MS);
  const webhookEvents = await pruneInChunks(
    outOfTime,
    () =>
      prisma.webhookEvent.findMany({
        where: { createdAt: { lt: webhookCutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: PRUNE_CHUNK,
      }),
    (ids) => prisma.webhookEvent.deleteMany({ where: { id: { in: ids } } }),
  );

  const alertCutoff = new Date(now.getTime() - OWNER_NOTIFICATION_RETENTION_DAYS * DAY_MS);
  const alertWhere = {
    createdAt: { lt: alertCutoff },
    status: { in: ["sent", "failed", "skipped"] },
    NOT: [{ dedupeKey: { startsWith: "setup:" } }, { dedupeKey: { startsWith: "test-alert:" } }],
  };
  const ownerNotifications = await pruneInChunks(
    outOfTime,
    () =>
      prisma.ownerNotification.findMany({
        where: alertWhere,
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: PRUNE_CHUNK,
      }),
    (ids) => prisma.ownerNotification.deleteMany({ where: { id: { in: ids } } }),
  );

  if (webhookEvents.removed || ownerNotifications.removed) {
    logInfo("retention.operational_logs_pruned", {
      webhookEvents: webhookEvents.removed,
      ownerNotifications: ownerNotifications.removed,
    });
  }
  return {
    webhookEvents: webhookEvents.removed,
    ownerNotifications: ownerNotifications.removed,
    finished: webhookEvents.finished && ownerNotifications.finished,
  };
}
