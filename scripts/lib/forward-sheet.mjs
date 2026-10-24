/**
 * Shared text for shop forward one-pager (CLI + docs mirror).
 * Honest sales language — no warranties, no Connect claims.
 */

export function formatPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(value ?? "").trim() || "(Orvius line not assigned yet)";
}

/**
 * @param {{
 *   shopName: string;
 *   orviusLine?: string | null;
 *   publicShopPhone?: string | null;
 *   ownerPhone?: string | null;
 *   ownerEmail?: string | null;
 * }} input
 */
export function buildForwardSheet(input) {
  const shop = input.shopName?.trim() || "Your shop";
  const line = formatPhone(input.orviusLine);
  const publicPhone = input.publicShopPhone?.trim()
    ? formatPhone(input.publicShopPhone)
    : "(your Google / truck / yard sign number)";
  const ownerPhone = input.ownerPhone?.trim()
    ? formatPhone(input.ownerPhone)
    : "(owner cell — not the shop line)";
  const ownerEmail =
    input.ownerEmail?.trim() || "(owner email for SMS failover)";

  return `
════════════════════════════════════════════════════════
ORVIUS — SHOP FORWARD ONE-PAGER
${shop}
════════════════════════════════════════════════════════

WHAT ORVIUS DOES
  • Answers every call you send from the number customers already call
  • Qualifies: name, phone, service, urgency, address
  • When the caller picks a time, the job is booked and they hear that time
  • A window that was only proposed still texts a confirm link
  • Texts you the lead summary (email failover if SMS fails)
  • Keeps one shop record for leads, jobs, and weekly proof

WHAT ORVIUS DOES NOT DO (yet)
  • Catch calls on your public number unless you forward.
    Orvius can't change the carrier's setting.
  • Treat a window the caller did not pick as a locked appointment
    until they confirm the text
  • Pay estimate card money into your shop bank (Connect later)
  • Sync Jobber / ServiceTitan
  • Guarantee “zero missed jobs” or 100% answer rate

────────────────────────────────────────────────────────
YOUR ORVIUS LINE:  ${line}
FORWARD FROM:      ${publicPhone}
OWNER ALERTS:      ${ownerPhone}
OWNER EMAIL:       ${ownerEmail}
────────────────────────────────────────────────────────

HOW TO FORWARD (carrier / phone system)
  1. Keep your public number on Google, trucks, and ads.
  2. From the phone that owns it, dial the every-call code
     so Orvius answers. That is a setting, not an application.
  3. Or send only the calls you don't answer, or publish the
     Orvius line as a new main number.
  4. Call the business number from another phone. Orvius should
     answer, and the business phone should stay quiet.
  5. Settings marks it working when that call arrives.
     A line existing is not proof.

GO-LIVE CHECK (before promising capture)
  [ ] Orvius line answers a real call
  [ ] Owner cell gets the alert (not the Twilio line)
  [ ] Customer receipt, or confirm text for a proposed window, works
  [ ] Overflow forward confirmed — or you told them honestly
  [ ] Avg ticket + before-Orvius baselines set
  [ ] Founder phone cert 5/5 stamped

SAY ON EVERY SALE
  “Customers keep their number. One code sends every call to
   Orvius. We only catch what you forward.”
  “If they picked the time on the call, they're booked. A
   window they did not pick still confirms by text.”
  “Card pay on estimates is Orvius checkout until Connect.”

Docs: docs/SHOP-FORWARD-ONEPAGER.md
Page: /pilot/forward
════════════════════════════════════════════════════════
`.trim();
}

export function buildSalesHonestyBullets() {
  return [
    "Forward required for public-number capture — or sell Orvius as the published line.",
    "A time they did not pick on the call is not locked until they confirm.",
    "Estimate card ≠ shop bank until Stripe Connect.",
    "No Jobber/ServiceTitan sync claim.",
    "No zero-missed / 100% / guaranteed language.",
  ];
}
