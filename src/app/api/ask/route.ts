import { NextResponse } from "next/server";
import { askShop } from "@/lib/shop-brain";

export async function POST(request: Request) {
  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();

  if (!question || question.length < 2) {
    return NextResponse.json({ error: "Ask a question about the shop." }, { status: 400 });
  }

  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long." }, { status: 400 });
  }

  try {
    const result = await askShop(question);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
