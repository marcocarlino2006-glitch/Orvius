import { TRADE_PLAYBOOKS, classifyRequest } from "@/lib/trade-playbooks";
import { INDUSTRY_KIND, OFFERED_TRADES, isTrade, type Trade } from "@/lib/trades";

/*
  Turning Orvius on. A new owner gets a test-mode workspace the moment they
  pick a business type: their real settings, no phone line, no charge, and
  every text it would send written as simulated. Going live is the last step
  and the only one that buys a number, takes payment or reaches a real person.
*/

export const SETUP_STEPS = ["business", "goal", "day", "permissions", "test", "live"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: unknown): value is SetupStep {
  return typeof value === "string" && (SETUP_STEPS as readonly string[]).includes(value);
}

export const SETUP_GOALS = [
  {
    id: "after_hours",
    title: "After-hours calls",
    line: "Answer when you're closed and have the work waiting in the morning.",
  },
  {
    id: "overflow",
    title: "Overflow calls",
    line: "Pick up when you're on another call, on a job or can't get to the phone.",
  },
  {
    id: "booking",
    title: "Booking",
    line: "Offer callers your real open times and put the visit on your schedule.",
  },
  {
    id: "follow_ups",
    title: "Follow-ups",
    line: "Text callers who didn't book and confirm the ones who did.",
  },
] as const;
export type SetupGoal = (typeof SETUP_GOALS)[number]["id"];

export function isSetupGoal(value: unknown): value is SetupGoal {
  return SETUP_GOALS.some((goal) => goal.id === value);
}

export type SetupState = {
  sandbox?: boolean;
  step?: SetupStep;
  goal?: SetupGoal;
  team?: "solo" | "crew";
  permissions?: "alert" | "offer" | "confirm";
  testedAt?: string;
  liveAt?: string;
};

export function parseSetup(json: string | null | undefined): SetupState {
  try {
    const raw = JSON.parse(json || "{}") as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return {};
    return {
      ...(raw.sandbox === true ? { sandbox: true } : {}),
      ...(isSetupStep(raw.step) ? { step: raw.step } : {}),
      ...(isSetupGoal(raw.goal) ? { goal: raw.goal } : {}),
      ...(raw.team === "solo" || raw.team === "crew" ? { team: raw.team } : {}),
      ...(raw.permissions === "alert" || raw.permissions === "offer" || raw.permissions === "confirm"
        ? { permissions: raw.permissions }
        : {}),
      ...(typeof raw.testedAt === "string" ? { testedAt: raw.testedAt } : {}),
      ...(typeof raw.liveAt === "string" ? { liveAt: raw.liveAt } : {}),
    };
  } catch {
    return {};
  }
}

/** A shop still in test mode: real settings, no line, nothing reaches a real person. */
export function isSetupSandbox(business: { environment?: string | null; setupJson?: string | null }): boolean {
  return business.environment === "test" && parseSetup(business.setupJson).sandbox === true;
}

export const SETUP_TRADES: readonly Trade[] = OFFERED_TRADES;

export function setupTradeGroups(): Array<{ title: string; trades: Trade[] }> {
  return [
    { title: "We come to you", trades: SETUP_TRADES.filter((t) => INDUSTRY_KIND[t] === "field") },
    { title: "Customers come to us", trades: SETUP_TRADES.filter((t) => INDUSTRY_KIND[t] === "office") },
  ].filter((g) => g.trades.length > 0);
}

export function isSetupTrade(value: unknown): value is Trade {
  return typeof value === "string" && isTrade(value) && SETUP_TRADES.includes(value);
}

/* ── What Orvius may do without asking ─────────────────────────────────── */

export const PERMISSION_LEVELS = [
  {
    id: "alert",
    title: "Alert me first",
    line: "Orvius takes the request and tells you. Nothing goes on the schedule until you decide.",
    bookingMode: "alert",
    autopilot: false,
  },
  {
    id: "offer",
    title: "Offer open times",
    line: "Callers pick one of your real open times. Orvius books it, gives it to the person who fits, and texts the customer the time.",
    bookingMode: "book",
    autopilot: false,
  },
  {
    id: "confirm",
    title: "Book and confirm",
    line: "Everything above, plus Orvius follows up before the visit until the customer confirms, and assigns any work still unassigned.",
    bookingMode: "book",
    autopilot: true,
  },
] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]["id"];

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return PERMISSION_LEVELS.some((level) => level.id === value);
}

export function permissionLevelFor(business: { bookingMode?: string | null; autopilot?: boolean | null }): PermissionLevel {
  if (business.bookingMode === "alert") return "alert";
  return business.autopilot === false ? "offer" : "confirm";
}

export function permissionSettings(level: PermissionLevel): { bookingMode: "alert" | "book"; autopilot: boolean } {
  const found = PERMISSION_LEVELS.find((item) => item.id === level) ?? PERMISSION_LEVELS[0];
  return { bookingMode: found.bookingMode, autopilot: found.autopilot };
}

export function defaultLevelForGoal(goal: SetupGoal | undefined): PermissionLevel {
  return goal === "booking" ? "confirm" : goal === "follow_ups" ? "offer" : "alert";
}

/** What never runs on its own, whatever level the owner picks. */
export function alwaysToAPerson(trade: Trade | null | undefined): string[] {
  const safety = trade ? TRADE_PLAYBOOKS[trade].safety.slice(0, 3).map((rule) => rule.label) : [];
  return [
    safety.length ? `Emergencies and safety calls: ${safety.join(", ").toLowerCase()}` : "Emergencies and anything that sounds unsafe",
    "Callers who ask for a person, or are unhappy about a past visit",
    "Anything Orvius isn't sure about: missing details, outside your area, a time that was taken",
  ];
}

/* ── How the day works ─────────────────────────────────────────────────── */

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayHours = { open: string; close: string; closed?: boolean };

function weekOf(rule: (day: (typeof DAYS)[number]) => DayHours | null): string {
  return JSON.stringify(
    Object.fromEntries(DAYS.map((day) => [day, rule(day) ?? { closed: true, open: "00:00", close: "00:00" }])),
  );
}

const WEEKDAY = (day: string) => day !== "saturday" && day !== "sunday";

export const HOURS_PRESETS = [
  {
    id: "weekdays",
    label: "Weekdays, 8 to 5",
    hoursJson: weekOf((day) => (WEEKDAY(day) ? { open: "08:00", close: "17:00" } : null)),
  },
  {
    id: "weekdays_saturday",
    label: "Weekdays 7 to 6, Saturday 8 to 1",
    hoursJson: weekOf((day) =>
      WEEKDAY(day) ? { open: "07:00", close: "18:00" } : day === "saturday" ? { open: "08:00", close: "13:00" } : null,
    ),
  },
  {
    id: "every_day",
    label: "Every day, 8 to 8",
    hoursJson: weekOf(() => ({ open: "08:00", close: "20:00" })),
  },
  {
    id: "salon",
    label: "Tuesday to Saturday, 9 to 7",
    hoursJson: weekOf((day) => (day === "sunday" || day === "monday" ? null : { open: "09:00", close: "19:00" })),
  },
] as const;
export type HoursPresetId = (typeof HOURS_PRESETS)[number]["id"];

export function hoursPresetFor(hoursJson: string | null | undefined): HoursPresetId | null {
  return HOURS_PRESETS.find((preset) => preset.hoursJson === hoursJson)?.id ?? null;
}

/** Service area and crew only matter for businesses that go to the customer. */
export function needsServiceArea(trade: Trade | null | undefined): boolean {
  return Boolean(trade && INDUSTRY_KIND[trade] === "field");
}

export function parseZipList(input: string): string[] {
  return Array.from(new Set(input.match(/\b\d{5}\b/g) ?? [])).slice(0, 60);
}

/* ── The test call ─────────────────────────────────────────────────────── */

export type SetupScenarioId = "routine" | "exception";

export type SetupScenario = {
  id: SetupScenarioId;
  label: string;
  expect: string;
  name: string;
  phone: string;
  serviceType: string;
  urgency: "emergency" | "same-day" | "this-week" | "flexible";
  address?: string;
  lines: string[];
};

/* 555-01xx numbers are reserved for fiction; nobody can be texted by accident. */
const TEST_CALLER = { name: "Jordan Avery", phone: "+13125550161" };
const TEST_EMERGENCY_CALLER = { name: "Sam Whitley", phone: "+13125550162" };
/* The routine call should read as everyday work, never as the trade's emergency. */
const URGENT_SERVICE = /burst|leak|power loss|lockout|broken|emergency|no heat/i;

/** "No cooling / AC repair" as a caller says it: lower case, acronyms kept. */
function asSpoken(label: string): string {
  return label.replace(/\b([A-Z])([a-z])/g, (_, a: string, b: string) => a.toLowerCase() + b);
}

export function setupScenarios(input: {
  trade: Trade;
  serviceZips?: string[];
  shopAddress?: string | null;
}): SetupScenario[] {
  const playbook = TRADE_PLAYBOOKS[input.trade];
  const field = INDUSTRY_KIND[input.trade] === "field";
  const service = playbook.services.find((s) => !URGENT_SERVICE.test(s.label)) ?? playbook.fallback;
  const zip = input.serviceZips?.[0];
  const address = field
    ? `1842 Oak Street${zip ? `, ${zip}` : ""}`
    : input.shopAddress?.trim() || "At your location";
  const want = asSpoken(service.label);
  const asked = /^no /.test(want) ? want : `${/^[aeiou]/.test(want) ? "an" : "a"} ${want}`;

  const routine: SetupScenario = {
    id: "routine",
    label: `A routine call: ${want}`,
    expect: "A new customer calls about everyday work.",
    ...TEST_CALLER,
    serviceType: service.label,
    urgency: "this-week",
    address,
    lines: [
      `User: Hi, I'm calling about ${asked}. Sometime this week would be great.`,
      "AI: I can help with that. Can I get your name and the best number to reach you?",
      `User: ${TEST_CALLER.name}, 312 555 0161.`,
      ...(field ? ["AI: And the address for the visit?", `User: ${address}.`] : []),
    ],
  };

  /* Only a rule the playbook really recognises from those words, so the test shows the escalation it promises. */
  const safety = playbook.safety.find(
    (rule) => classifyRequest({ business: { trade: input.trade }, serviceType: rule.label }).safety?.key === rule.key,
  );
  const exception: SetupScenario = safety
    ? {
        id: "exception",
        label: `An emergency: ${safety.label.toLowerCase()}`,
        expect: "A safety call. Orvius never books this; it goes straight to a person.",
        ...TEST_EMERGENCY_CALLER,
        serviceType: safety.label,
        urgency: "emergency",
        address: field ? `77 Main Street${zip ? `, ${zip}` : ""}` : address,
        lines: [
          `User: I need someone right now. ${safety.label}.`,
          "AI: Your safety comes first. I'm alerting the team now so someone calls you right back.",
          `User: It's ${TEST_EMERGENCY_CALLER.name}, 312 555 0162.`,
        ],
      }
    : {
        id: "exception",
        label: "An unhappy customer",
        expect: "A complaint about a past visit. Orvius never books this as new work; it goes to a person.",
        ...TEST_EMERGENCY_CALLER,
        serviceType: service.label,
        urgency: "same-day",
        address,
        lines: [
          `User: You came out last week for ${asked} and it's still not fixed. I want my money back.`,
          "AI: I'm sorry about that. I'll make sure the owner calls you back today.",
          `User: It's ${TEST_EMERGENCY_CALLER.name}, 312 555 0162.`,
        ],
      };

  return [routine, exception];
}

/* ── Going live ────────────────────────────────────────────────────────── */

export type GoLiveItemState = "live" | "not_connected" | "needs_approval";

export type GoLiveItem = { id: string; label: string; state: GoLiveItemState; detail: string };

export function buildGoLiveChecklist(input: {
  sandbox: boolean;
  line: string | null;
  lineVerifiedAt: Date | string | null;
  overflowForwardConfirmedAt: Date | string | null;
  ownerPhone: string | null;
  ownerSmsOptOutAt?: Date | string | null;
  recordingDisclosed: boolean;
}): GoLiveItem[] {
  return [
    {
      id: "permission",
      label: "Your go-ahead and plan",
      state: input.sandbox ? "needs_approval" : "live",
      detail: input.sandbox
        ? "Nothing answers real callers until you approve it and choose a plan."
        : "Approved. Your plan is active.",
    },
    {
      id: "line",
      label: "Your Orvius number",
      state: input.line ? (input.lineVerifiedAt ? "live" : "not_connected") : "not_connected",
      detail: input.line
        ? input.lineVerifiedAt
          ? "Answering. A real call has come through."
          : "Ready. Call it once to prove it answers."
        : "Assigned when you go live.",
    },
    {
      id: "forward",
      label: "Your existing number",
      state: input.overflowForwardConfirmedAt ? "live" : "not_connected",
      detail: input.overflowForwardConfirmedAt
        ? "Forwarding to Orvius."
        : "Forward missed or after-hours calls to Orvius, or put the Orvius number on your website.",
    },
    {
      id: "messaging",
      label: "Texts to you",
      state: input.ownerSmsOptOutAt ? "not_connected" : input.ownerPhone && !input.sandbox ? "live" : "not_connected",
      detail: input.ownerSmsOptOutAt
        ? "You replied STOP. Text START to Orvius to get alerts again."
        : input.ownerPhone && !input.sandbox
          ? "Alerts go to your mobile."
          : "Add your mobile so alerts reach you. Until then they are simulated.",
    },
    {
      id: "recording",
      label: "Recording and consent",
      state: input.recordingDisclosed ? "live" : "needs_approval",
      detail: input.recordingDisclosed
        ? "Callers are told the call is recorded before anything else."
        : "Callers must be told the call is recorded. Approve the notice before going live.",
    },
  ];
}
