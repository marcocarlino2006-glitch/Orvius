import { getDomainConfig } from "@/lib/domains";

function isSet(key: string) {
  return Boolean(process.env[key]?.trim());
}

export function getGoogleClientId() {
  return (
    process.env.AUTH_GOOGLE_ID?.trim() ??
    process.env.GOOGLE_CLIENT_ID?.trim() ??
    ""
  );
}

export function getGoogleClientSecret() {
  return (
    process.env.AUTH_GOOGLE_SECRET?.trim() ??
    process.env.GOOGLE_CLIENT_SECRET?.trim() ??
    ""
  );
}

export function getAuthConfigStatus() {
  const items = [
    { name: "AUTH_SECRET", configured: isSet("AUTH_SECRET"), optional: false },
    {
      name: "GOOGLE_CLIENT_ID",
      configured: Boolean(getGoogleClientId()),
      optional: false,
    },
    {
      name: "GOOGLE_CLIENT_SECRET",
      configured: Boolean(getGoogleClientSecret()),
      optional: false,
    },
    {
      name: "ORVIUS_AUTH_ALLOWED_EMAILS",
      configured: isSet("ORVIUS_AUTH_ALLOWED_EMAILS"),
      optional: true,
    },
  ] as const;

  const ready = items.filter((item) => !item.optional).every((item) => item.configured);
  const domains = getDomainConfig();
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

  const redirectUris = [
    `${protocol}://localhost:3000/api/auth/callback/google`,
    `${protocol}://${domains.primary}/api/auth/callback/google`,
    `${protocol}://${domains.app}/api/auth/callback/google`,
    `${protocol}://${domains.api}/api/auth/callback/google`,
  ];

  return {
    ready,
    items,
    redirectUris,
    docsPath: "/docs/AUTH-GOOGLE.md",
  };
}
