import { company } from "@/lib/company";

/*
  The one look every Orvius email shares: the word, one sentence that says
  why it came, a few short paragraphs, at most one button, and a quiet
  footer. Table layout and inline styles because mail clients ignore
  stylesheets; system fonts because they can't load Geist. Every email also
  carries the same words as plain text for clients that show only that.
*/

export type EmailContent = {
  /** Shown beside the subject in the inbox list, never in the body. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Label and value pairs, like the line's number. */
  facts?: Array<[string, string]>;
  action?: { label: string; href: string };
  /** Small print under the button: why they got it, and how to stop it. */
  footer?: string;
  unsubscribeHref?: string | null;
};

const INK = "#111111";
const MUTE = "#6b6b6b";
const RULE = "#e6e6e6";
const PAGE = "#f6f6f4";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href) ? escapeHtml(href) : "#";
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font:400 15px/1.55 ${FONT};color:${INK};">${escapeHtml(p)}</p>`,
    )
    .join("");
  const facts = content.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 18px;border-top:1px solid ${RULE};">${content.facts
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${RULE};font:400 13px/1.4 ${FONT};color:${MUTE};">${escapeHtml(label)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${RULE};font:500 14px/1.4 ${FONT};color:${INK};">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;"><tr><td style="border-radius:8px;background:${INK};"><a href="${safeHref(content.action.href)}" style="display:inline-block;padding:12px 20px;font:500 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.action.label)}</a></td></tr></table>`
    : "";
  const footerBits = [
    content.footer ? escapeHtml(content.footer) : "",
    content.unsubscribeHref
      ? `<a href="${safeHref(content.unsubscribeHref)}" style="color:${MUTE};text-decoration:underline;">Stop these emails</a>`
      : "",
    `${escapeHtml(company.productName)} · <a href="mailto:${company.supportEmail}" style="color:${MUTE};text-decoration:underline;">${company.supportEmail}</a>`,
  ].filter(Boolean);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PAGE};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background:#ffffff;border:1px solid ${RULE};border-radius:12px;">
<tr><td style="padding:28px 32px 0;font:600 13px/1 ${FONT};letter-spacing:0.22em;color:${INK};">ORVIUS</td></tr>
<tr><td style="padding:22px 32px 4px;"><h1 style="margin:0 0 16px;font:400 22px/1.3 ${FONT};color:${INK};">${escapeHtml(content.heading)}</h1>${paragraphs}${facts}${action}</td></tr>
<tr><td style="padding:18px 32px 26px;font:400 12px/1.6 ${FONT};color:${MUTE};">${footerBits.join("<br>")}</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.facts?.length ? [...content.facts.map(([label, value]) => `${label}: ${value}`), ""] : []),
    ...(content.action ? [`${content.action.label}: ${content.action.href}`, ""] : []),
    ...(content.footer ? [content.footer] : []),
    ...(content.unsubscribeHref ? [`Stop these emails: ${content.unsubscribeHref}`] : []),
    `${company.productName} · ${company.supportEmail}`,
  ].join("\n");

  return { html, text };
}
