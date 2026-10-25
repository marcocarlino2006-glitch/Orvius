/**
 * Plain-English capture setup for shop owners.
 * No CFNA jargon in primary copy — carrier labels + short steps.
 */

export type CaptureMode = "forward" | "publish";

export type CarrierId =
  | "verizon"
  | "att"
  | "tmobile"
  | "other"
  | "voip";

export type CarrierGuide = {
  id: CarrierId;
  label: string;
  steps: string[];
  /** Optional dial codes owners can try from their cell. The number goes between prefix and suffix. */
  dialCodes?: string[];
  dialSuffix?: string;
  /** Prefix a leading 1 to the 10-digit Orvius number. */
  dialCountryCode?: boolean;
};

export const CARRIERS: CarrierGuide[] = [
  {
    id: "verizon",
    label: "Verizon",
    steps: [
      "Keep the number on Google, your trucks and your ads.",
      "From that phone, dial *72 and your Orvius number, then call. That sends every call to Orvius. Your phone won't ring.",
      "To send only calls you don't answer, dial *71 and your Orvius number instead.",
      "Call your business number from another phone. Orvius should answer.",
    ],
    dialCodes: ["*72"],
  },
  {
    id: "att",
    label: "AT&T",
    steps: [
      "Keep the number on Google, your trucks and your ads.",
      "From that phone, dial **21*1 and your 10-digit Orvius number, then #, and press call. That sends every call to Orvius.",
      "To send only calls you don't answer, dial **004*1 and your 10-digit Orvius number, then #, instead.",
      "Call your business number from another phone. Orvius should answer.",
    ],
    dialCodes: ["**21*"],
    dialSuffix: "#",
    dialCountryCode: true,
  },
  {
    id: "tmobile",
    label: "T-Mobile",
    steps: [
      "Keep the number on Google, your trucks and your ads.",
      "From that phone, dial **21*1 and your 10-digit Orvius number, then #, and press call. That sends every call to Orvius.",
      "To send only calls you don't answer, dial **004*1 and your 10-digit Orvius number, then #, instead.",
      "Call your business number from another phone. Orvius should answer.",
    ],
    dialCodes: ["**21*"],
    dialSuffix: "#",
    dialCountryCode: true,
  },
  {
    id: "other",
    label: "Other cell",
    steps: [
      "Keep the number customers already call.",
      "In your phone's settings or your carrier's app, turn on call forwarding for every call. This is a setting, not an application.",
      "Forward those calls to your Orvius number. To send only calls you don't answer, choose that rule instead.",
      "Call your business number from another phone. Orvius should answer.",
    ],
  },
  {
    id: "voip",
    label: "Business / VoIP line",
    steps: [
      "Keep your published shop number.",
      "In your phone system's admin, forward all calls to your Orvius number.",
      "To send only unanswered calls, or only after hours, set that rule instead.",
      "Call the published number from another phone. Orvius should answer.",
    ],
  },
];

/** The full string to dial so every call on the business number reaches Orvius, e.g. "*728445550100" or "**21*18445550100#". */
export function forwardDialCode(carrier: CarrierGuide, orviusLine: string) {
  const prefix = carrier.dialCodes?.[0];
  if (!prefix) return null;
  const ten = orviusLine.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (ten.length !== 10) return null;
  return `${prefix}${carrier.dialCountryCode ? "1" : ""}${ten}${carrier.dialSuffix ?? ""}`;
}

export function getCarrier(id: CarrierId): CarrierGuide {
  return CARRIERS.find((c) => c.id === id) ?? CARRIERS[3]!;
}

/** SMS body for owner — short, actionable, stamp with DONE. */
export function buildForwardGuideSms(params: {
  shopName: string;
  orviusLine: string;
  mode: CaptureMode;
  carrier?: CarrierId;
}): string {
  const line = params.orviusLine.trim();
  if (params.mode === "publish") {
    return [
      `Orvius for ${params.shopName}:`,
      `Your shop line is ${line}.`,
      "It is already answering.",
      "Put this number on Google, trucks, and ads.",
    ].join("\n");
  }

  const carrier = getCarrier(params.carrier ?? "other");
  const code = forwardDialCode(carrier, line);
  const dial = code ? ` Quick try: dial ${code} from your cell (carrier-dependent).` : "";

  return [
    `Orvius for ${params.shopName}:`,
    `Send every call on your business number to ${line}.`,
    `${carrier.label}: ${carrier.steps[1] ?? carrier.steps[0]}`,
    dial.trim(),
    "Call your business number from another phone. Orvius should answer. Then reply DONE.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isOwnerCaptureDoneKeyword(body: string): boolean {
  const normalized = body
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  const token = normalized.split(" ")[0] ?? "";
  return (
    token === "done" ||
    token === "forwarded" ||
    normalized === "i did it" ||
    normalized === "all set"
  );
}
