import { NextRequest, NextResponse } from "next/server";
import { listThreads } from "@/lib/messages";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const query = request.nextUrl.searchParams.get("q")?.slice(0, 80) ?? "";
  const threads = await listThreads(business.id, { query });
  return NextResponse.json({
    threads,
    unread: threads.reduce((sum, thread) => sum + thread.unread, 0),
  });
}
