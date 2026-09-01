import { company } from "@/lib/company";

const EMAIL_TIMEOUT_MS = 12_000;

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
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

  const from =
    process.env.RESEND_FROM?.trim() ?? `${company.productName} <alerts@orvius.im>`;

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
