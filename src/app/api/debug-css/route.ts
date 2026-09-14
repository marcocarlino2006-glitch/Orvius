import { appendFileSync } from "node:fs";

export async function POST(request: Request) {
  const data = await request.json();

  // #region agent log
  appendFileSync(
    "/opt/cursor/logs/debug.log",
    `${JSON.stringify({
      hypothesisId: "F,G,H,I",
      location: "src/app/api/debug-css/route.ts:7",
      message: "Rendered deposit error cascade",
      data,
      timestamp: Date.now(),
    })}\n`,
  );
  // #endregion

  return Response.json({ ok: true });
}
