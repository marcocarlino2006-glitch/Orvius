import { NextResponse } from "next/server";
import { askOpening, askShop } from "@/lib/shop-brain";
import type { AskHistoryTurn } from "@/lib/ask-model";
import { requirePlanModule } from "@/lib/plan-gate";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const planGate = requirePlanModule(authResult.business, "ask");
  if ("error" in planGate) return planGate.error;
  try {
    const opening = await askOpening(authResult.business.id);
    return NextResponse.json({ ok: true, endpoint: "ask", opening });
  } catch {
    return NextResponse.json({ ok: true, endpoint: "ask", opening: null });
  }
}

/** Finished exchanges only, capped — enough to resolve "her" and "tomorrow?", never a fact source. */
function readHistory(value: unknown): AskHistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is { question: string; answer: string } =>
        Boolean(t) &&
        typeof t === "object" &&
        typeof (t as { question?: unknown }).question === "string" &&
        typeof (t as { answer?: unknown }).answer === "string",
    )
    .slice(-6)
    .map((t) => ({ question: t.question.slice(0, 500), answer: t.answer.slice(0, 1400) }));
}

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "ask");
  if ("error" in planGate) return planGate.error;

  const limited = await sharedRateLimit({ key: `ask:${business.id}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec, "Too many questions at once. Wait a moment and retry.");

  const body = (await request.json()) as { question?: string; history?: unknown };
  const question = body.question?.trim();
  const history = readHistory(body.history);

  if (!question || question.length < 2) {
    return NextResponse.json({ error: "Ask a question about the shop." }, { status: 400 });
  }

  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long." }, { status: 400 });
  }

  try {
    const result = await askShop(question, business.id, history);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
