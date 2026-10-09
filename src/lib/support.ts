import { company } from "@/lib/company";
import { DEMO_LINE_TEL } from "@/lib/demo-line";

/**
 * One place that builds a "get me a human" link.
 *
 * The support address was reachable from the marketing footer and from a Legal
 * panel on the billing page, which meant the people who could not find it were
 * exactly the people who needed it: signed-in owners with something broken in
 * front of them. Worse, a support mail written from scratch at 3am arrives
 * saying "it's not working", and the round trip to find out which screen and
 * which shop costs the owner another night.
 *
 * So every entry point goes through here, and every one of them arrives with
 * the context already in the body.
 */
export function supportMailto(context?: {
  /** What the owner was looking at. */
  subject?: string;
  /** The route, when we know it. */
  path?: string;
  /** React's error digest — the only handle that ties a report to a log line. */
  reference?: string;
}) {
  const subject = context?.subject
    ? `${company.productName}: ${context.subject}`
    : `${company.productName} support`;

  /*
    Pre-filled, but above a blank line the owner writes in. Everything below
    the rule is ours; the first thing their cursor lands on is theirs.
  */
  const lines = [
    "",
    "",
    "— please leave the details below for support —",
    context?.path ? `Screen: ${context.path}` : null,
    context?.reference ? `Reference: ${context.reference}` : null,
  ].filter((line) => line !== null);

  const query = new URLSearchParams({
    subject,
    body: lines.join("\n"),
  });

  return `mailto:${company.supportEmail}?${query.toString()}`;
}

export const supportEmail = company.supportEmail;

export const SUPPORT_RESPONSE = "A person answers, normally within one business day.";

/*
  A number a person picks up, set per deploy. Never the demo line: that number
  is answered by the AI receptionist, so a stuck owner calling it for help gets
  a sales demo. Inlined at build, so it works in client components too.
*/
export function supportPhone(raw = process.env.NEXT_PUBLIC_ORVIUS_SUPPORT_PHONE): { display: string; tel: string } | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  const tel = `+1${national}`;
  if (tel === DEMO_LINE_TEL) return null;
  return { tel, display: `+1 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}` };
}
