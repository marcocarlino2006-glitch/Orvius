import { normalizePhone } from "@/lib/customer";

/*
  Orvius serves US and Canadian shops, so every text goes to a US or Canadian
  number. Anything else is how SMS pumping is billed to us: a bot types
  premium-rate numbers into a public form and the carrier on the far end
  splits the per-message fee. International numbers are the obvious route;
  the subtle one is the Caribbean, which shares the +1 country code but bills
  as international at many times the US rate.
*/

/** +1 area codes outside the US and Canada. US territories (PR, USVI, Guam, CNMI, Samoa) stay textable. */
const NANP_ELSEWHERE = new Set([
  "242", "246", "264", "268", "284", "345", "441", "473", "649", "658", "664",
  "721", "758", "767", "784", "809", "829", "849", "868", "869", "876",
]);

/** Premium-rate and non-geographic exchanges no customer texts from. */
const NOT_A_MOBILE = new Set(["900", "976"]);

export const UNTEXTABLE_PHONE_MESSAGE = "Enter a US or Canadian mobile number so we can text you back.";

export function isTextableNumber(phone: string | null | undefined): boolean {
  const normalized = normalizePhone(phone);
  const match = normalized?.match(/^\+1([2-9]\d{2})([2-9]\d{2})\d{4}$/);
  if (!match) return false;
  const [, area, exchange] = match;
  if (NANP_ELSEWHERE.has(area!) || NOT_A_MOBILE.has(area!)) return false;
  // N11 codes (411, 911) are services, not subscribers.
  if (area![1] === "1" && area![2] === "1") return false;
  if (exchange === "976") return false;
  return true;
}
