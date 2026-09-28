import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { canProvisionDedicatedLine, listAvailableNumbers, parseAreaCode } from "@/lib/twilio-phone";

/** Numbers the owner can pick before paying for provisioning. Searching is free; buying happens on create. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const areaCode = parseAreaCode(request.nextUrl.searchParams.get("areaCode"));
  if (!areaCode) {
    return NextResponse.json({ error: "Enter a three-digit area code" }, { status: 400 });
  }

  const limit = await sharedRateLimit({
    key: `onboarding-numbers:${clientIp(request)}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many searches. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  if (!canProvisionDedicatedLine()) {
    return NextResponse.json({ areaCode, numbers: [], searchable: false });
  }

  try {
    const numbers = await listAvailableNumbers(areaCode, 5);
    return NextResponse.json({ areaCode, numbers, searchable: true });
  } catch {
    return NextResponse.json({ areaCode, numbers: [], searchable: false });
  }
}
