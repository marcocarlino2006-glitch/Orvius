import { company } from "@/lib/company";

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
