import type { CarrierId } from "@/lib/carrier-forward";

/**
 * Connect your number → choose coverage → test → activate.
 *
 * Orvius cannot change a carrier's settings. Cell carriers accept a short code
 * dialed from the phone itself, and office phone systems are set in their own
 * admin. So every path here is guided, never "one click", and the test call is
 * what proves the connection: a receiving number existing is not proof the
 * shop's calls reach it.
 */

export type Coverage = "missed" | "all" | "after_hours" | "main";

export const COVERAGE_LABEL: Record<Coverage, string> = {
  missed: "Calls I don't answer",
  all: "Every call",
  after_hours: "After hours, on a schedule",
  main: "Use an Orvius number as my main line",
};

export const COVERAGE_DETAIL: Record<Coverage, string> = {
  missed: "Your phone rings first. If nobody picks up, the line is busy, or you have no signal, Orvius answers.",
  all: "Orvius answers every call to your number. Your phone won't ring.",
  after_hours: "Your phone system sends calls to Orvius outside the hours you set there.",
  main: "Put the Orvius number on Google, your trucks and ads. Nothing to forward.",
};

export type ConnectionSupport = "dial_code" | "phone_system" | "carrier_app";

export type CarrierPath = {
  support: ConnectionSupport;
  /** Which coverages this kind of line can do on its own. */
  coverages: Coverage[];
  /** Said plainly so nobody expects a button to reach into their carrier. */
  howItWorks: string;
};

export const CARRIER_PATHS: Record<CarrierId, CarrierPath> = {
  verizon: {
    support: "dial_code",
    coverages: ["missed", "all", "main"],
    howItWorks: "You dial one short code from the phone that owns the number. Orvius can't change Verizon's settings for you.",
  },
  att: {
    support: "dial_code",
    coverages: ["missed", "all", "main"],
    howItWorks: "You dial one short code from the phone that owns the number. Orvius can't change AT&T's settings for you.",
  },
  tmobile: {
    support: "dial_code",
    coverages: ["missed", "all", "main"],
    howItWorks: "You dial one short code from the phone that owns the number. Orvius can't change T-Mobile's settings for you.",
  },
  other: {
    support: "carrier_app",
    coverages: ["missed", "all", "main"],
    howItWorks: "Turn on call forwarding in your phone's settings or your carrier's app. Codes differ by carrier, so Orvius doesn't guess one.",
  },
  voip: {
    support: "phone_system",
    coverages: ["missed", "all", "after_hours", "main"],
    howItWorks: "Set the forwarding rule in your phone system's admin, or ask your provider to. Orvius can't sign in to it for you.",
  },
};

const tenDigits = (line: string) => {
  const ten = line.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return ten.length === 10 ? ten : null;
};

/** The code that turns forwarding on and the one that turns it off, for carriers that take codes. */
export function forwardingCodes(carrier: CarrierId, coverage: Coverage, orviusLine: string): { on: string; off: string } | null {
  const ten = tenDigits(orviusLine);
  if (!ten || (coverage !== "missed" && coverage !== "all")) return null;
  if (carrier === "verizon") return coverage === "all" ? { on: `*72${ten}`, off: "*73" } : { on: `*71${ten}`, off: "*73" };
  if (carrier === "att" || carrier === "tmobile") {
    return coverage === "all" ? { on: `**21*1${ten}#`, off: "##21#" } : { on: `**004*1${ten}#`, off: "##004#" };
  }
  return null;
}

/** tel: links need # escaped or the dialer drops everything after it. */
export function dialHref(code: string) {
  return `tel:${code.replace(/#/g, "%23")}`;
}

export function connectSteps(carrier: CarrierId, coverage: Coverage, orviusLine: string): string[] {
  if (coverage === "main") {
    return [
      "Replace the number on Google, your website, trucks and ads with your Orvius number.",
      "Keep your old number forwarded to Orvius until everything is updated.",
      "Run the test below from any phone.",
    ];
  }
  const codes = forwardingCodes(carrier, coverage, orviusLine);
  if (codes) {
    return [
      `From the phone that owns your business number, dial ${codes.on} and press call.`,
      "Wait for the confirmation tone or message, then hang up.",
      "Run the test below. Don't answer when your phone rings.",
    ];
  }
  if (carrier === "voip") {
    return coverage === "after_hours"
      ? [
          "In your phone system's admin, find the after-hours or schedule rule.",
          "Send calls outside your hours to your Orvius number.",
          "Run the test below during closed hours, or temporarily set the schedule to closed.",
        ]
      : [
          `In your phone system's admin, forward ${coverage === "all" ? "all calls" : "unanswered and busy calls"} to your Orvius number.`,
          "Save the rule. Some systems take a minute to apply it.",
          "Run the test below.",
        ];
  }
  return [
    `Open call forwarding in your phone's settings or your carrier's app and forward ${coverage === "all" ? "all calls" : "calls when unanswered, busy or unreachable"} to your Orvius number.`,
    "Run the test below. Don't answer when your phone rings.",
  ];
}

/** How to undo it. The customer's number never leaves their carrier through forwarding. */
export function disconnectSteps(carrier: CarrierId, coverage: Coverage, orviusLine: string): string[] {
  if (coverage === "main") {
    return ["Put your old number back on Google, trucks and ads. The Orvius number stops answering when you cancel."];
  }
  const codes = forwardingCodes(carrier, coverage, orviusLine);
  if (codes) return [`Dial ${codes.off} from the phone that owns your business number. Calls ring only your phone again.`];
  if (carrier === "voip") return ["Remove the forwarding rule in your phone system's admin, or ask your provider to."];
  return ["Turn call forwarding off in your phone's settings or your carrier's app."];
}

export const NUMBER_OWNERSHIP =
  "Your business number stays with your carrier. Forwarding only tells it where to send calls, and you can turn it off yourself any time.";

export const PORT_OUT_RIGHTS =
  "Moving your number to Orvius is optional. If you do, it stays yours: you can move it to any carrier whenever you like, Orvius won't block or delay the transfer, and it is never released while it's yours, even if your plan lapses.";

export type ForwardTestState = "calling" | "reached" | "not_reached" | "answered_elsewhere" | "busy" | "failed" | "unavailable";

export type ForwardTestVerdict = { state: ForwardTestState; title: string; fix: string | null };

/** Waiting longer than this after dialing, with nothing at Orvius, is a failed forward. */
export const FORWARD_TEST_WINDOW_MS = 60_000;

/**
 * Turns what the phone network reported into words an owner can act on.
 * `arrived` is the only proof of success: the test call showed up at Orvius.
 */
export function forwardTestVerdict(input: {
  arrived: boolean;
  /** Status of the call Orvius placed to the business number. */
  outbound: string | null;
  elapsedMs: number;
  coverage: Coverage;
}): ForwardTestVerdict {
  if (input.arrived) {
    return {
      state: "reached",
      title:
        input.coverage === "main"
          ? "The test call reached Orvius."
          : "Your business number sent the test call to Orvius.",
      fix: null,
    };
  }
  const status = (input.outbound ?? "").toLowerCase();
  const done = ["completed", "busy", "no-answer", "failed", "canceled"].includes(status);
  if (!done && input.elapsedMs < FORWARD_TEST_WINDOW_MS) {
    return { state: "calling", title: "Calling your business number… don't answer it.", fix: null };
  }
  if (status === "failed") {
    return {
      state: "failed",
      title: "Orvius couldn't place a call to that number.",
      fix: "Check the business number is right and can take calls, then test again.",
    };
  }
  if (status === "busy") {
    return {
      state: "busy",
      title: "Your number was busy and didn't send the call to Orvius.",
      fix: "Turn on forwarding for busy calls, then test again.",
    };
  }
  if (status === "completed") {
    return {
      state: "answered_elsewhere",
      title: "Something answered your number before Orvius could — usually voicemail.",
      fix:
        input.coverage === "all"
          ? "Forwarding for every call isn't on. Turn it on, then test again."
          : "Turn forwarding on for unanswered calls, or turn off carrier voicemail so it doesn't pick up first. Then test again.",
    };
  }
  return {
    state: "not_reached",
    title: "Your test call didn't reach Orvius — check forwarding.",
    fix: "Your number rang and nothing forwarded. Turn forwarding on with the steps above, then test again.",
  };
}

export type ConnectionHealth = {
  state: "test_mode" | "no_line" | "not_proven" | "proven" | "test_failed";
  label: string;
  detail: string;
};

/** What Command says about whether the shop's calls actually reach Orvius. */
export function connectionHealth(input: {
  testMode: boolean;
  line: string | null;
  provenAt: Date | string | null;
  lastTest: { state: string; title: string; at: Date | string } | null;
}): ConnectionHealth {
  if (input.testMode) {
    return { state: "test_mode", label: "Not connected yet", detail: "You're in test mode. Connect your number when you go live." };
  }
  if (!input.line) return { state: "no_line", label: "No Orvius line", detail: "Calls can't reach Orvius until a line exists." };
  const lastTestAt = input.lastTest ? new Date(input.lastTest.at).getTime() : 0;
  const provenAt = input.provenAt ? new Date(input.provenAt).getTime() : 0;
  if (input.lastTest && input.lastTest.state !== "reached" && input.lastTest.state !== "calling" && lastTestAt > provenAt) {
    return { state: "test_failed", label: "Last test failed", detail: input.lastTest.title };
  }
  if (input.provenAt) {
    return {
      state: "proven",
      label: "Reaching Orvius",
      detail: `Proven ${new Date(input.provenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} by a call that came through your number.`,
    };
  }
  return {
    state: "not_proven",
    label: "Not proven yet",
    detail: "Orvius has a line, but no call has come through your business number yet. Run the test.",
  };
}
