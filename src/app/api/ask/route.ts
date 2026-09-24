import { NextResponse } from "next/server";
import { askShop } from "@/lib/shop-brain";
import { requirePlanModule } from "@/lib/plan-gate";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const planGate = requirePlanModule(authResult.business, "ask");
  if ("error" in planGate) return planGate.error;
  return NextResponse.json({ ok: true, endpoint: "ask" });
}

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "ask");
  if ("error" in planGate) return planGate.error;

  const limited = rateLimit({ key: `ask:${business.id}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many questions at once. Wait a moment and retry.");

  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();

  if (!question || question.length < 2) {
    return NextResponse.json({ error: "Ask a question about the shop." }, { status: 400 });
  }

  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long." }, { status: 400 });
  }

  try {
    const result = await askShop(question, business.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
