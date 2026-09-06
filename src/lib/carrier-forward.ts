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
  /** Optional dial codes owners can try from their cell (US GSM). */
  dialCodes?: string[];
};

export const CARRIERS: CarrierGuide[] = [
  {
    id: "verizon",
    label: "Verizon",
    steps: [
      "Keep your public Google / truck number.",
      "Dial *71 + your Orvius number, then call to turn on missed-call forward.",
      "Or: Verizon account → Call forwarding → forward unanswered / busy to Orvius.",
      "Call your public number, let it ring — Orvius should answer.",
    ],
    dialCodes: ["*71"],
  },
  {
    id: "att",
    label: "AT&T",
    steps: [
      "Keep your public Google / truck number.",
      "Dial *92 + your Orvius number to forward when you don't answer.",
      "Or: myAT&T → Phone settings → Call forwarding → unanswered / busy.",
      "Call your public number, let it ring — Orvius should answer.",
    ],
    dialCodes: ["*92"],
  },
  {
    id: "tmobile",
    label: "T-Mobile",
    steps: [
      "Keep your public Google / truck number.",
      "Dial **61* + Orvius digits + # (no +1) for no-answer forward.",
      "Or: T-Life / account → Call forwarding → unanswered / busy.",
      "Call your public number, let it ring — Orvius should answer.",
    ],
    dialCodes: ["**61*"],
  },
  {
    id: "other",
    label: "Other cell",
    steps: [
      "Keep your public Google / truck number.",
      "In your phone settings or carrier app, turn on call forwarding for missed, busy, and no-answer.",
      "Forward those to your Orvius number.",
      "Call your public number, let it ring — Orvius should answer.",
    ],
  },
  {
    id: "voip",
    label: "Business / VoIP line",
    steps: [
      "Keep your published shop number.",
      "Ask your provider (or open the phone system admin) for after-hours / no-answer / busy forward.",
      "Point those routes at your Orvius number.",
      "Place a test call to the public number after hours or with no answer.",
    ],
  },
];

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
      "Put this number on Google, trucks, and ads.",
      "Call the Orvius line once to prove it answers, then reply DONE.",
    ].join("\n");
  }

  const carrier = getCarrier(params.carrier ?? "other");
  const dial =
    carrier.dialCodes?.[0] != null
      ? ` Quick try: dial ${carrier.dialCodes[0]}${line.replace(/\D/g, "").replace(/^1/, "")} from your cell (carrier-dependent).`
      : "";

  return [
    `Orvius for ${params.shopName}:`,
    `Forward missed / busy / after-hours to ${line}.`,
    `${carrier.label}: ${carrier.steps[1] ?? carrier.steps[0]}`,
    dial.trim(),
    "Call your Orvius line once to prove it, finish forward, then reply DONE.",
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
