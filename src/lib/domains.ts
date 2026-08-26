/**
 * Orvius domain configuration.
 *
 * Production layout:
 *   orvius.com          → marketing (/)
 *   app.orvius.com      → admin + dashboard
 *   api.orvius.com      → webhooks (optional alias to same app)
 */

export type DomainConfig = {
  primary: string;
  app: string;
  api: string;
  marketing: string;
};

function cleanHost(value: string | undefined) {
  if (!value) return null;
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function getPrimaryDomain() {
  return cleanHost(process.env.ORVIUS_PRIMARY_DOMAIN) ?? "orvius.com";
}

export function getDomainConfig(): DomainConfig {
  const primary = getPrimaryDomain();

  return {
    primary,
    marketing: cleanHost(process.env.ORVIUS_MARKETING_DOMAIN) ?? primary,
    app: cleanHost(process.env.ORVIUS_APP_DOMAIN) ?? `app.${primary}`,
    api: cleanHost(process.env.ORVIUS_API_DOMAIN) ?? `api.${primary}`,
  };
}

export function getPublicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const domains = getDomainConfig();
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${domains.app}`;
}

export function getAllowedHosts() {
  const domains = getDomainConfig();
  const hosts = new Set<string>([
    domains.primary,
    domains.marketing,
    domains.app,
    domains.api,
    `www.${domains.primary}`,
    "localhost",
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const host = cleanHost(appUrl);
  if (host) hosts.add(host);

  return hosts;
}

export function buildDnsRecords(deployTarget: "vercel" | "railway" | "custom") {
  const domains = getDomainConfig();

  const base = {
    marketing: {
      host: domains.marketing === domains.primary ? "@" : domains.marketing,
      purpose: "Marketing site + landing page",
    },
    app: {
      host: domains.app.replace(`.${domains.primary}`, "") || "app",
      purpose: "Admin dashboard and internal app",
    },
    api: {
      host: domains.api.replace(`.${domains.primary}`, "") || "api",
      purpose: "Twilio + Vapi webhooks",
    },
  };

  if (deployTarget === "vercel") {
    return {
      provider: "Vercel",
      records: [
        {
          type: "A",
          name: "@",
          value: "76.76.21.21",
          ...base.marketing,
        },
        {
          type: "CNAME",
          name: "www",
          value: "cname.vercel-dns.com",
          purpose: "Redirect www → apex",
        },
        {
          type: "CNAME",
          name: base.app.host,
          value: "cname.vercel-dns.com",
          ...base.app,
        },
        {
          type: "CNAME",
          name: base.api.host,
          value: "cname.vercel-dns.com",
          ...base.api,
        },
      ],
      env: {
        NEXT_PUBLIC_APP_URL: `https://${domains.api}`,
        ORVIUS_PRIMARY_DOMAIN: domains.primary,
        ORVIUS_APP_DOMAIN: domains.app,
        ORVIUS_API_DOMAIN: domains.api,
      },
    };
  }

  return {
    provider: "Custom",
    records: [
      {
        type: "A or CNAME",
        name: "@",
        value: "Your server IP or host",
        ...base.marketing,
      },
      {
        type: "CNAME",
        name: base.app.host,
        value: "Same deploy target as API",
        ...base.app,
      },
      {
        type: "CNAME",
        name: base.api.host,
        value: "Same deploy target as app",
        ...base.api,
      },
    ],
    env: {
      NEXT_PUBLIC_APP_URL: `https://${domains.api}`,
      ORVIUS_PRIMARY_DOMAIN: domains.primary,
      ORVIUS_APP_DOMAIN: domains.app,
      ORVIUS_API_DOMAIN: domains.api,
    },
  };
}

export const DOMAIN_CANDIDATES = [
  {
    domain: "orvius.com",
    status: "taken",
    note: "Parked/for sale — worth trying to acquire via broker",
    tier: "ideal",
  },
  {
    domain: "getorvius.com",
    status: "likely_available",
    note: "Strong SaaS pattern (Stripe, Notion style)",
    tier: "recommended",
  },
  {
    domain: "useorvius.com",
    status: "likely_available",
    note: "Clear product intent",
    tier: "recommended",
  },
  {
    domain: "orvius.ai",
    status: "likely_available",
    note: "Perfect for AI positioning",
    tier: "recommended",
  },
  {
    domain: "orvius.io",
    status: "likely_available",
    note: "Clean tech startup alternative",
    tier: "good",
  },
  {
    domain: "tryorvius.com",
    status: "likely_available",
    note: "Good for pilot / design partner phase",
    tier: "good",
  },
] as const;
