import { company } from "@/lib/company";
import { getAppUrl } from "@/lib/env";

/* RFC 9116. Expires is required and must be under a year out, so it is computed rather than hand-edited. */
export function GET() {
  const site = getAppUrl().replace(/\/$/, "");
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  const body = [
    `Contact: mailto:${company.securityEmail}`,
    `Expires: ${expires.toISOString()}`,
    `Policy: ${site}/security`,
    "Preferred-Languages: en",
    `Canonical: ${site}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
