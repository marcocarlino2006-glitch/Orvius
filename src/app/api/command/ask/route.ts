import { NextResponse } from "next/server";
import { z } from "zod";
import { askToAct } from "@/lib/command-intent";
import { logWarn } from "@/lib/logger";
import { askShop } from "@/lib/shop-brain";
import { requirePlanModule } from "@/lib/plan-gate";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

const bodySchema = z.object({ text: z.string().trim().min(2).max(300) });

const ASK_ACT_HINT = "Try “book Maria tomorrow at 2”, “move Carter to Friday 9am”, “send Ben to Maria”, or “what's on today?”.";

/**
 * The one place the owner directs Orvius. An instruction becomes a proposal to
 * approve or real choices; a question about the work is answered from records.
 */
export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const planGate = requirePlanModule(business, "ask");
  if ("error" in planGate) return planGate.error;
  const limited = await sharedRateLimit({ key: `command-ask:${business.id}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what Orvius should do." }, { status: 400 });
  const result = await askToAct(business, parsed.data.text);
  if (result) return NextResponse.json(result);
  try {
    const answer = await askShop(parsed.data.text, business.id);
    return NextResponse.json({
      kind: "answer",
      message: answer.answer,
      records: answer.hits.slice(0, 4).map((h) => ({ href: h.href, title: h.title, summary: h.summary })),
    });
  } catch (error) {
    logWarn("command.ask_answer_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ kind: "clarify", message: `Orvius couldn't read the records just now. ${ASK_ACT_HINT}` });
  }
}
