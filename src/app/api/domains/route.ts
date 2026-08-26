import { NextResponse } from "next/server";
import {
  buildDnsRecords,
  DOMAIN_CANDIDATES,
  getDomainConfig,
  getPublicAppUrl,
} from "@/lib/domains";

export async function GET() {
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
