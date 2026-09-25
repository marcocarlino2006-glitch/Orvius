import { loadCalendarFeed, verifyCalendarFeedToken } from "@/lib/calendar-feed";

type Params = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const businessId = verifyCalendarFeedToken(token);
  const body = businessId ? await loadCalendarFeed(businessId) : null;
  if (!body) {
    return new Response("Calendar not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="orvius-jobs.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
