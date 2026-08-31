import { getAppBaseUrl } from "@/lib/domains";

export function getStripeAppBaseUrl() {
  const url =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (url?.startsWith("http")) return url.replace(/\/$/, "");
  if (url) return `https://${url}`;

  return getAppBaseUrl();
}
