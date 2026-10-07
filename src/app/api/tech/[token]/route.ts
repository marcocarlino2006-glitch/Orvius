import { techDay } from "@/lib/tech-app";
import { withTech } from "@/lib/tech-route";

type Params = { params: Promise<{ token: string }> };

/** The technician's day: what they're in the middle of, then their jobs by day. */
export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  return withTech(request, token, (tech) => techDay(tech));
}
