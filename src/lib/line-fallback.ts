import { getWebhookUrl } from "@/lib/env";

/*
  Does each live shop line actually have its Vapi-outage net?

  The fallback URL is set when a line is bought and again on every repair, but
  Vapi imports the same Twilio number and rewrites its voice settings, so what
  Twilio holds right now is the only proof. This reads it back, per number.
*/

export type LineFallbackStatus = "ok" | "missing" | "wrong" | "not_on_account" | "fixed";

export type LineFallbackRow = {
  phone: string;
  status: LineFallbackStatus;
  /** Where the AI call goes: Vapi's voice URL, something else, or nothing. */
  aiRoute: "vapi" | "other" | "none";
  current: string | null;
};

type TwilioNumber = { sid: string; phoneNumber: string; voiceUrl?: string | null; voiceFallbackUrl?: string | null };

export type LineFallbackClient = {
  incomingPhoneNumbers: {
    list(params: { phoneNumber: string; limit: number }): Promise<TwilioNumber[]>;
    (sid: string): { update(params: { voiceFallbackUrl: string; voiceFallbackMethod: "POST" }): Promise<unknown> };
  };
};

export function expectedVoiceFallbackUrl() {
  return getWebhookUrl("/api/webhooks/twilio/voice-fallback");
}

function aiRouteOf(voiceUrl: string | null | undefined): LineFallbackRow["aiRoute"] {
  const url = voiceUrl?.trim();
  if (!url) return "none";
  return /(^|\.)vapi\.ai\b/i.test(url) ? "vapi" : "other";
}

export async function auditLineFallback(
  phones: string[],
  client: LineFallbackClient,
  options: { fix?: boolean } = {},
): Promise<LineFallbackRow[]> {
  const expected = expectedVoiceFallbackUrl();
  const rows: LineFallbackRow[] = [];
  for (const phone of [...new Set(phones)]) {
    const [entry] = await client.incomingPhoneNumbers.list({ phoneNumber: phone, limit: 1 });
    if (!entry) {
      rows.push({ phone, status: "not_on_account", aiRoute: "none", current: null });
      continue;
    }
    const current = entry.voiceFallbackUrl?.trim() || null;
    const aiRoute = aiRouteOf(entry.voiceUrl);
    if (current === expected) {
      rows.push({ phone, status: "ok", aiRoute, current });
      continue;
    }
    if (options.fix) {
      await client.incomingPhoneNumbers(entry.sid).update({ voiceFallbackUrl: expected, voiceFallbackMethod: "POST" });
      rows.push({ phone, status: "fixed", aiRoute, current });
      continue;
    }
    rows.push({ phone, status: current ? "wrong" : "missing", aiRoute, current });
  }
  return rows;
}

/** Lines that would give a caller Twilio's error tone if the AI were down. */
export function unprotectedLines(rows: LineFallbackRow[]) {
  return rows.filter((row) => row.status === "missing" || row.status === "wrong");
}
