import { NextResponse } from "next/server";
import { z } from "zod";
import { askToAct } from "@/lib/command-intent";
import { requirePlanModule } from "@/lib/plan-gate";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

const bodySchema = z.object({ text: z.string().trim().min(2).max(300) });

const ASK_ACT_HINT = "Try “book Maria tomorrow at 2”, “move Carter to Friday 9am”, or “send Ben to Maria”.";

/** The owner asks Orvius to act; the answer is a proposal to approve, real choices, or a question. */
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
  return NextResponse.json(result ?? { kind: "clarify", message: `Orvius can book, move, or assign from here. ${ASK_ACT_HINT}` });
}
