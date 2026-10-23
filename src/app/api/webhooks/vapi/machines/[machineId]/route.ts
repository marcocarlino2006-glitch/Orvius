import { NextRequest, NextResponse } from "next/server";
import { openVoiceMachine } from "@/lib/voice-machine";
import { handleVapiWebhook } from "../../route";

export const maxDuration = 60;

type Params = { params: Promise<{ machineId: string }> };

/** This shop's voice process. Another shop's seal does not open it. */
export async function POST(request: NextRequest, { params }: Params) {
  const { machineId } = await params;
  const opened = await openVoiceMachine(machineId, request.headers.get("x-vapi-secret"));
  if (!opened) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handleVapiWebhook(request, opened);
}
