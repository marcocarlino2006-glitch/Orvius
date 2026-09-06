import { NextResponse } from "next/server";
import { confirmJobByCustomerToken } from "@/lib/customer-confirm";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await confirmJobByCustomerToken(token.trim());
  if (!result.ok) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    already: result.already,
    job: {
      ...result.job,
      scheduledAt: result.job.scheduledAt?.toISOString() ?? null,
    },
  });
}

export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await confirmJobByCustomerToken(token.trim());
  if (!result.ok) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    already: result.already,
    job: {
      ...result.job,
      scheduledAt: result.job.scheduledAt?.toISOString() ?? null,
    },
  });
}
