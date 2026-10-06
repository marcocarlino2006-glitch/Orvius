import { techJobDetail, techUpdateJob } from "@/lib/tech-app";
import { readJson, withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, (tech) => techJobDetail(tech, jobId));
}

/** On the way, arrived, finished, or the arrival estimate. */
export async function PATCH(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => techUpdateJob(tech, jobId, await readJson(request)));
}
