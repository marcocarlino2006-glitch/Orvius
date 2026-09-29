import { NextResponse } from "next/server";
import { confirmJobByCustomerToken } from "@/lib/customer-confirm";
import { publicTokenLimited } from "@/lib/rate-limit";

type Params = { params: Promise<{ token: string }> };

function failure(result: { error: "not_found" | "expired"; businessName?: string }) {
  if (result.error === "expired") {
    const who = result.businessName ?? "the shop";
    return NextResponse.json(
      { error: `This visit has passed or was closed, so the link no longer works. Call ${who} if you need anything.` },
      { status: 410 },
    );
  }
  return NextResponse.json({ error: "Link not found" }, { status: 404 });
}

export async function GET(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "confirm", "GET");
  if (limited) return limited;
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await confirmJobByCustomerToken(token.trim());
  if (!result.ok) return failure(result);

  return NextResponse.json({
    ok: true,
    already: result.already,
    job: {
      ...result.job,
      scheduledAt: result.job.scheduledAt?.toISOString() ?? null,
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const limited = await publicTokenLimited(request, "confirm", "POST");
  if (limited) return limited;
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await confirmJobByCustomerToken(token.trim());
  if (!result.ok) return failure(result);

  return NextResponse.json({
    ok: true,
    already: result.already,
    job: {
      ...result.job,
      scheduledAt: result.job.scheduledAt?.toISOString() ?? null,
    },
  });
}
