import { NextResponse } from "next/server";
import { readToolCalls } from "@/lib/in-call-tool-defs";
import { answerVoiceSimToolCalls, voiceSimSecretMatches } from "@/lib/voice-sim-tools";

/** Tool answers for the voice sim's receptionist only. See lib/voice-sim-tools.ts. */
export async function POST(request: Request) {
  if (!voiceSimSecretMatches(request.headers.get("x-vapi-secret"), process.env.VAPI_API_KEY)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { message?: Parameters<typeof readToolCalls>[0] } | null;
  const transferring = new URL(request.url).searchParams.get("transfer") === "1";
  return NextResponse.json({ results: answerVoiceSimToolCalls(readToolCalls(body?.message ?? {}), { transferring }) });
}
