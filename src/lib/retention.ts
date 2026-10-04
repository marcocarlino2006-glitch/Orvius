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

export async function purgeExpiredCallContent(
  options: {
    now?: Date;
    deleteVapi?: RemoteDelete | null;
    deleteTwilio?: RemoteDelete | null;
  } = {},
) {
  const now = options.now ?? new Date();
  const cutoff = callContentCutoff(now);
  const deleteVapi =
    options.deleteVapi !== undefined ? options.deleteVapi : process.env.VAPI_API_KEY ? deleteVapiCall : null;
  const deleteTwilio =
    options.deleteTwilio !== undefined
      ? options.deleteTwilio
      : process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? deleteTwilioRecording
        : null;

  const calls = await prisma.call.findMany({
    where: { createdAt: { lt: cutoff }, contentPurgedAt: null },
    select: { id: true, vapiCallId: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });

  let purged = 0;
  let remotePending = 0;
  for (const call of calls) {
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
  }

  const voicemails = await prisma.lead.findMany({
    where: { createdAt: { lt: cutoff }, notes: { contains: "/Recordings/RE" } },
    select: { id: true, notes: true },
    take: BATCH,
  });

  let voicemailsPurged = 0;
  for (const lead of voicemails) {
    const notes = lead.notes ?? "";
    const sids = [...new Set([...notes.matchAll(RECORDING_SID)].map((m) => m[1]!))];
    if (!deleteTwilio) {
      remotePending += 1;
      continue;
    }
    try {
      for (const sid of sids) await deleteTwilio(sid);
    } catch (error) {
      remotePending += 1;
      logWarn("retention.twilio_delete_failed", {
        leadId: lead.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
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
  }

  if (purged || voicemailsPurged || remotePending) {
    logInfo("retention.call_content_purged", { purged, voicemailsPurged, remotePending, cutoff: cutoff.toISOString() });
  }
  return { purged, voicemailsPurged, remotePending };
}
