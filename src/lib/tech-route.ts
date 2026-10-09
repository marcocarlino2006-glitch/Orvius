import { NextResponse } from "next/server";
import { FieldError } from "@/lib/job-field";
import { logWarn } from "@/lib/logger";
import { clientIp, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { techForToken, type TechSession } from "@/lib/tech-app";

/** Run a technician-app request: rate limit, resolve the link, and turn FieldErrors into answers. */
export async function withTech(request: Request, token: string, run: (tech: TechSession) => Promise<Response | object>) {
  /*
    A technician on a job saves every stepper tap and photo, so the budget sits
    well above the customer links. Tokens are 32+ random characters, so this
    is about scripted abuse, not guessing.
  */
  const write = request.method !== "GET";
  const limited = await sharedRateLimit({ key: `public:tech-app:${write ? "write" : "read"}:${clientIp(request)}`, limit: write ? 120 : 240, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const tech = await techForToken(token);
  if (!tech) {
    return NextResponse.json({ error: "This link is off. Ask the office to text you a new one." }, { status: 404 });
  }
  try {
    const out = await run(tech);
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (error) {
    if (error instanceof FieldError) return NextResponse.json({ error: error.message }, { status: error.status });
    logWarn("tech_app.failed", { technicianId: tech.id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "That didn't save on our side. Try again in a minute; if it keeps happening, call the office." }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw new FieldError("Send JSON.");
  return body as Record<string, unknown>;
}
