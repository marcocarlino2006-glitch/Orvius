import { NextResponse } from "next/server";
import {
  buildDnsRecords,
  DOMAIN_CANDIDATES,
  getDomainConfig,
  getPublicAppUrl,
} from "@/lib/domains";
import { isFounderEmail } from "@/lib/founder";
import { forbiddenResponse, requireEntitledSession } from "@/lib/tenant";

/**
 * The DNS wiring plan for the founder, and nobody else.
 *
 * This answered anonymous requests in production. What it hands back is the
 * whole shape of the deployment: the record table, the names and values of the
 * domain env vars, and — the part that matters — the exact webhook URLs Twilio
 * and Vapi post to. Publishing those is publishing where to aim a forged call
 * payload, and no public page reads any of it.
 */
export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  if (!isFounderEmail(auth.email)) return forbiddenResponse();

  const domains = getDomainConfig();
  const deployTarget =
    (process.env.ORVIUS_DEPLOY_TARGET as "vercel" | "railway" | "custom") ??
    "vercel";

  return NextResponse.json({
    domains,
    candidates: DOMAIN_CANDIDATES,
    publicAppUrl: getPublicAppUrl(),
    webhookUrls: {
      vapi: `${getPublicAppUrl()}/api/webhooks/vapi`,
      twilioSms: `${getPublicAppUrl()}/api/webhooks/twilio/sms`,
    },
    dns: buildDnsRecords(deployTarget),
    emailSuggestions: [
      { address: `hello@${domains.primary}`, use: "General contact" },
      { address: `support@${domains.primary}`, use: "Customer support" },
      { address: `founder@${domains.primary}`, use: "Outbound sales" },
    ],
  });
}
