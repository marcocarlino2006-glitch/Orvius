import { techCollect } from "@/lib/tech-app";
import { readJson, withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string; jobId: string }> };

/** Get paid on site: text the pay link, pay on this phone, or record cash or a check. */
export async function POST(request: Request, { params }: Params) {
  const { token, jobId } = await params;
  return withTech(request, token, async (tech) => techCollect(tech, jobId, (await readJson(request)).method));
}
