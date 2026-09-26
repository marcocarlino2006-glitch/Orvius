import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";
import { vapiRecordingRedirect } from "@/lib/vapi";

type Params = { params: Promise<{ id: string }> };

/**
 * Vapi keeps recordings in private storage; the URL on the webhook is not
 * downloadable. Each play asks Vapi for a fresh short-lived signed link.
 */
export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const { id } = await params;

  const call = await prisma.call.findFirst({
    where: { id, businessId: business.id },
    select: { vapiCallId: true, recordingUrl: true },
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  const target = call.vapiCallId ? await vapiRecordingRedirect(call.vapiCallId) : call.recordingUrl;
  if (!target) return NextResponse.json({ error: "No recording for this call" }, { status: 404 });

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
