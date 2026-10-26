import { company } from "@/lib/company";
import { logInfo, logWarn } from "@/lib/logger";
import { smsHelpReply } from "@/lib/sms-keywords";
import { usStateCode } from "@/lib/us-state";

/*
  Toll-free verification for the shared Orvius sender, filed through Twilio's
  API from /admin so the founder never works the Twilio console. Everything
  that describes Orvius is fixed here (it is the same answer every time and is
  what docs/TOLL-FREE-VERIFICATION.md lists); only facts about the owner and
  the legal entity are typed in.
*/

export type TollFreeOwnerFacts = {
  ein: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  firstName: string;
  lastName: string;
  phone: string;
};

/*
  Twilio rejects this field, with the opaque message "Invalid use case summary",
  once it passes 500 characters. Both selected categories still have to be in it:
  account notifications for the owner, customer care for the caller.
*/
export const USE_CASE_SUMMARY =
  "Orvius sends transactional texts only, never marketing, for HVAC, plumbing and electrical shops. Account notifications: the owner enters a mobile number during setup and is texted when a caller requests service. Customer care: the customer calls or texts the shop first and gives a number for that job. Messages cover that job only: received, a proposed time and confirm link, one reminder, one follow-up, and a pay link. Each customer text names the shop and says Reply STOP to opt out.";

export const MESSAGE_SAMPLES = [
  "Same day · AC not cooling\nAnn Lee\n12 Oak St, Austin TX\n+15125550101\nProposed window · Thu, Oct 1, 2:00 PM CDT (awaiting customer confirm)",
  "Cole Heating: we have you down for service\nProposed window: Thu Oct 1, 2–4 PM\nConfirm here: https://app.orvius.im/c/example\n\nReply STOP to opt out. Msg&data rates may apply.",
  "Cole Heating: thanks for choosing us. Your balance is $285.00. Pay securely here: https://app.orvius.im/i/example\n\nReply STOP to opt out. Msg&data rates may apply.",
].join("\n\n---\n\n");

const OPT_IN_DETAIL =
  "Owners: during onboarding the owner enters their mobile number and turns on lead alerts; the SMS terms (orvius.im/sms-terms) are linked there. " +
  "Customers: the customer contacts the business first, by phone or text, to request service and gives their mobile number so the business can reach them about that request. No list is imported or purchased, and no one is texted who did not contact the business.";

const digits = (v: string) => v.replace(/\D/g, "");

/** What's wrong with the typed facts, in plain words, or null when they can be filed. */
export function tollFreeFactsProblem(f: TollFreeOwnerFacts): string | null {
  if (digits(f.ein).length !== 9) return "The EIN is 9 digits, like 12-3456789.";
  if (!f.street.trim() || !f.city.trim()) return "Add the street and city exactly as they appear on the EIN record.";
  if (!usStateCode(f.state)) return "Use the two-letter state, like NY.";
  if (!/^\d{5}(-\d{4})?$/.test(f.postalCode.trim())) return "The ZIP code is 5 digits.";
  if (!f.firstName.trim() || !f.lastName.trim()) return "Add your first and last name.";
  const phone = digits(f.phone);
  if (!(phone.length === 10 || (phone.length === 11 && phone.startsWith("1")))) return "Add a 10-digit US phone number.";
  return null;
}

export function buildTollFreeForm(f: TollFreeOwnerFacts, numberSid: string): URLSearchParams {
  const phone = digits(f.phone);
  const ein = digits(f.ein);
  const form = new URLSearchParams({
    TollfreePhoneNumberSid: numberSid,
    BusinessName: company.legalName,
    DoingBusinessAs: company.productName,
    BusinessType: "PRIVATE_PROFIT",
    BusinessRegistrationNumber: `${ein.slice(0, 2)}-${ein.slice(2)}`,
    BusinessRegistrationAuthority: "EIN",
    BusinessRegistrationCountry: "US",
    BusinessWebsite: `https://${company.domain}`,
    BusinessStreetAddress: f.street.trim(),
    BusinessCity: f.city.trim(),
    BusinessStateProvinceRegion: usStateCode(f.state) ?? f.state.trim().toUpperCase(),
    BusinessPostalCode: f.postalCode.trim(),
    BusinessCountry: "US",
    BusinessContactFirstName: f.firstName.trim(),
    BusinessContactLastName: f.lastName.trim(),
    BusinessContactEmail: company.supportEmail,
    BusinessContactPhone: `+1${phone.slice(-10)}`,
    NotificationEmail: company.supportEmail,
    UseCaseSummary: USE_CASE_SUMMARY,
    ProductionMessageSample: MESSAGE_SAMPLES,
    OptInType: "VERBAL",
    MessageVolume: "1,000",
    PrivacyPolicyUrl: `https://${company.domain}/privacy`,
    TermsAndConditionsUrl: `https://${company.domain}/terms`,
    HelpMessageSample: smsHelpReply({ programName: company.productName, supportEmail: company.supportEmail }),
    AdditionalInformation: OPT_IN_DETAIL,
    AgeGatedContent: "false",
  });
  if (f.street2?.trim()) form.set("BusinessStreetAddress2", f.street2.trim());
  form.append("UseCaseCategories", "ACCOUNT_NOTIFICATIONS");
  form.append("UseCaseCategories", "CUSTOMER_CARE");
  form.append("OptInImageUrls", `https://${company.domain}/sms-terms`);
  return form;
}

/* Tests point this at a fake Twilio; production always talks to Twilio. */
function twilioBase(host: "api" | "messaging") {
  const override = process.env.TWILIO_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== "production") return override.replace(/\/$/, "");
  return host === "api" ? "https://api.twilio.com" : "https://messaging.twilio.com";
}

export type SubmitResult = { ok: true; status: string; updated: boolean } | { ok: false; error: string };

export async function submitTollFreeVerification(facts: TollFreeOwnerFacts): Promise<SubmitResult> {
  const state = usStateCode(facts.state);
  if (state) facts = { ...facts, state };
  const problem = tollFreeFactsProblem(facts);
  if (problem) return { ok: false, error: problem };
  const number = process.env.TWILIO_PHONE_NUMBER?.trim();
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!number || !sid || !token) return { ok: false, error: "Twilio isn't connected: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Vercel." };
  const headers = { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` };

  try {
    const owned = await fetch(`${twilioBase("api")}/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const numberSid = ((await owned.json().catch(() => null)) as { incoming_phone_numbers?: Array<{ sid: string }> } | null)
      ?.incoming_phone_numbers?.[0]?.sid;
    if (!owned.ok || !numberSid) return { ok: false, error: `${number} isn't a number on this Twilio account.` };

    const listed = await fetch(`${twilioBase("messaging")}/v1/Tollfree/Verifications?TollfreePhoneNumberSid=${numberSid}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const existing = [...(((await listed.json().catch(() => null)) as { verifications?: Array<{ sid: string; status?: string; date_created?: string }> } | null)?.verifications ?? [])]
      .sort((a, b) => String(b.date_created).localeCompare(String(a.date_created)))[0];
    if (existing && existing.status !== "TWILIO_REJECTED") {
      return { ok: false, error: `This number's verification is already ${String(existing.status).toLowerCase().replace(/_/g, " ")}. Nothing to submit.` };
    }

    // A rejected verification is corrected in place; Twilio refuses a second one for the same number.
    const url = existing
      ? `${twilioBase("messaging")}/v1/Tollfree/Verifications/${existing.sid}`
      : `${twilioBase("messaging")}/v1/Tollfree/Verifications`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: buildTollFreeForm(facts, numberSid),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
    if (!res.ok) {
      logWarn("toll_free.submit_failed", { status: res.status, message: body?.message });
      return { ok: false, error: `Twilio didn't accept it: ${body?.message ?? `error ${res.status}`}` };
    }
    logInfo("toll_free.submitted", { updated: Boolean(existing), status: body?.status });
    return { ok: true, status: body?.status ?? "PENDING_REVIEW", updated: Boolean(existing) };
  } catch (error) {
    logWarn("toll_free.submit_error", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: "Couldn't reach Twilio. Try again in a minute." };
  }
}
