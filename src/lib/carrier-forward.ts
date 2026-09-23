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

/** Digits for carrier dial strings — strip +1 / non-digits. */
export function orviusDialDigits(line: string | null | undefined): string {
  if (!line?.trim()) return "";
  return line.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export function buildCarrierDialExample(
  carrier: CarrierId,
  line: string | null | undefined,
): string | null {
  const digits = orviusDialDigits(line);
  if (!digits) return null;
  switch (carrier) {
    case "verizon":
      return `*71${digits}`;
    case "att":
      return `*92${digits}`;
    case "tmobile":
      return `**61*${digits}#`;
    default:
      return null;
  }
}

export const CARRIERS: CarrierGuide[] = [
  {
    id: "verizon",
    label: "Verizon",
    steps: [
      "Keep your public Google / truck number.",
      "From that cell, dial *71 + your Orvius number, then call — turns on missed-call forward.",
      "Or: Verizon account → Call forwarding → unanswered / busy → Orvius.",
      "Call your public number, let it ring out — Orvius should answer.",
      "Then open Settings and confirm capture (or text DONE after a prove call on the Orvius line).",
    ],
    dialCodes: ["*71"],
  },
  {
    id: "att",
    label: "AT&T",
    steps: [
      "Keep your public Google / truck number.",
      "From that cell, dial *92 + your Orvius number — forwards when you don't answer.",
      "Or: myAT&T → Phone settings → Call forwarding → unanswered / busy → Orvius.",
      "Call your public number, let it ring out — Orvius should answer.",
      "Then open Settings and confirm capture (or text DONE after a prove call on the Orvius line).",
    ],
    dialCodes: ["*92"],
  },
  {
    id: "tmobile",
    label: "T-Mobile",
    steps: [
      "Keep your public Google / truck number.",
      "From that cell, dial **61* + Orvius digits + # (no +1) for no-answer forward.",
      "Or: T-Life / account → Call forwarding → unanswered / busy → Orvius.",
      "Call your public number, let it ring out — Orvius should answer.",
      "Then open Settings and confirm capture (or text DONE after a prove call on the Orvius line).",
    ],
    dialCodes: ["**61*"],
  },
  {
    id: "other",
    label: "Other cell",
    steps: [
      "Keep your public Google / truck number.",
      "In phone settings or the carrier app, turn on forward for missed, busy, and no-answer.",
      "Point those to your Orvius number.",
      "Call your public number, let it ring out — Orvius should answer.",
      "Then open Settings and confirm capture (or text DONE after a prove call on the Orvius line).",
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
      "Then open Settings and confirm capture (or text DONE after a prove call on the Orvius line).",
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
  const dialExample = buildCarrierDialExample(
    params.carrier ?? "other",
    line,
  );
  const dial = dialExample
    ? ` Quick try from your cell: dial ${dialExample} (carrier-dependent).`
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
