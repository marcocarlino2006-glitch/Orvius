/**
 * Orvius domain configuration.
 *
 * Production layout:
 *   orvius.im          → marketing (/)
 *   app.orvius.im      → admin + dashboard
 *   api.orvius.im      → webhooks (optional alias to same app)
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
  return cleanHost(process.env.ORVIUS_PRIMARY_DOMAIN) ?? "orvius.im";
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
  if (configured) {
    // Vapi/Twilio require https for public hosts — never emit http://api.*
    if (/^http:\/\/(?!localhost|127\.0\.0\.1)/i.test(configured)) {
      return configured.replace(/^http:/i, "https:").replace(/\/$/, "");
    }
    return configured.replace(/\/$/, "");
  }

  const domains = getDomainConfig();
  const local =
    process.env.NODE_ENV !== "production" &&
    (domains.app.includes("localhost") || domains.app.startsWith("127."));
  const protocol = local ? "http" : "https";
  return `${protocol}://${domains.app}`;
}

/** Dashboard, Stripe redirects, owner SMS links */
export function getAppBaseUrl() {
  return getPublicAppUrl();
}

/** Vapi + Twilio webhooks — always https for real domains */
export function getApiBaseUrl() {
  const configured =
    process.env.ORVIUS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    const cleaned = configured.replace(/\/$/, "");
    if (/^http:\/\/(?!localhost|127\.0\.0\.1)/i.test(cleaned)) {
      return cleaned.replace(/^http:/i, "https:");
    }
    return cleaned;
  }

  const domains = getDomainConfig();
  const local =
    domains.api.includes("localhost") || domains.api.startsWith("127.");
  const protocol = local ? "http" : "https";
  return `${protocol}://${domains.api}`;
}

export function getLeadInboxUrl(leadId: string) {
  return `${getAppBaseUrl()}/dashboard/inbox/${leadId}`;
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
        NEXT_PUBLIC_APP_URL: `https://${domains.app}`,
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
    domain: "orvius.im",
    status: "owned",
    note: "Your primary domain — currently pointed at Manus, needs DNS update",
    tier: "ideal",
  },
  {
    domain: "app.orvius.im",
    status: "owned",
    note: "Admin + dashboard subdomain",
    tier: "recommended",
  },
  {
    domain: "api.orvius.im",
    status: "owned",
    note: "Twilio + Vapi webhooks",
    tier: "recommended",
  },
] as const;
