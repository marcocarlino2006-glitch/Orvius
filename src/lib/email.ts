import { company } from "@/lib/company";

const EMAIL_TIMEOUT_MS = 12_000;

const DEFAULT_FROM = `${company.productName} <alerts@orvius.im>`;

/** Reject theater From values that look set but will bounce. */
export function isValidResendFrom(from: string | null | undefined): boolean {
  if (!from?.trim()) return false;
  const raw = from.trim();
  if (/YOUR_|changeme|placeholder|example\.com/i.test(raw)) return false;
  const email = raw.includes("<")
    ? raw.match(/<([^>]+)>/)?.[1]?.trim()
    : raw;
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function resolveResendFrom(): string {
  const configured = process.env.RESEND_FROM?.trim();
  if (configured && isValidResendFrom(configured)) return configured;
  return DEFAULT_FROM;
}

export function isEmailConfigured() {
  if (!process.env.RESEND_API_KEY?.trim()) return false;
  const configured = process.env.RESEND_FROM?.trim();
  // Missing From is fine — we ship a valid Orvius default.
  // A present-but-invalid From must fail closed so failover does not pretend to work.
  if (configured && !isValidResendFrom(configured)) return false;
  return true;
}

export async function sendOwnerEmail(params: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const from = resolveResendFrom();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Email send failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as { id?: string };
    return json.id ?? "sent";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Email send timed out after ${EMAIL_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
