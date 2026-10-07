import { NextResponse } from "next/server";
import { FieldError } from "@/lib/job-field";
import { requirePlanModule } from "@/lib/plan-gate";
import { requireEntitledSession } from "@/lib/tenant";

type Session = Exclude<Awaited<ReturnType<typeof requireEntitledSession>>, { error: unknown }>;

/** Run a signed-in office request on the shop's jobs, turning FieldErrors into answers. */
export async function withOffice(module: "jobs" | "dispatch", run: (session: Session) => Promise<Response | object>) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const gate = requirePlanModule(authResult.business, module);
  if ("error" in gate) return gate.error;
  try {
    const out = await run(authResult);
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (error) {
    if (error instanceof FieldError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
