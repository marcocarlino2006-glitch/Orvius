import { NextResponse } from "next/server";

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A `<Response>` carrying one SMS reply, or an empty one to say nothing. */
export function twimlMessage(message: string) {
  return twimlResponse(
    message ? `<Message>${escapeXml(message)}</Message>` : "",
  );
}

/**
 * Raw TwiML, with the header Twilio needs to parse it as verbs.
 *
 * Returning `application/json` here is not a validation error Twilio reports
 * back to anyone — the call just fails, and the caller hears Twilio's own
 * error tone instead of whatever the body said.
 */
export function twimlResponse(body: string) {
  return new NextResponse(`<Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
