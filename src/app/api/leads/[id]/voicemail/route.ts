import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

const RECORDING = /https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/(AC[0-9a-f]{32})\/Recordings\/(RE[0-9a-f]{32})/gi;

/**
 * Plays a voicemail to the signed-in shop only. A Twilio recording URL opens
 * for anyone who has it, and a texted link lives on in message history and
 * carrier logs, so the alert links here and the audio is fetched with the
 * account's own credentials.
 */
export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({ where: { id, businessId: business.id }, select: { notes: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const latest = [...(lead.notes ?? "").matchAll(RECORDING)].at(-1);
  if (!latest) return NextResponse.json({ error: "No voicemail on this lead" }, { status: 404 });

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return NextResponse.json({ error: "Voicemail playback isn't set up" }, { status: 503 });

  const audio = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${latest[1]}/Recordings/${latest[2]}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
  });
  if (audio.status === 404) return NextResponse.json({ error: "This voicemail was deleted" }, { status: 410 });
  if (!audio.ok || !audio.body) return NextResponse.json({ error: "Voicemail is unavailable right now" }, { status: 502 });

  return new Response(audio.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" },
  });
}
