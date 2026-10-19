import type { ConnectionHealth } from "@/lib/number-connection";
import { paymentsActivation, type ConnectState } from "@/lib/payments-intro";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/setup-flow";
import type { TextingEligibility } from "@/lib/sms-eligibility";

/*
  What is actually on after go-live, each item proven by something that
  happened rather than by a setting being saved. "todo" items say exactly what
  to do next; nothing here is stamped as working because the owner clicked.
*/

export type ActivationState = "live" | "todo" | "off";
/**
 * Who an unfinished item is waiting on. "owner": something only the owner can
 * do. "provider": the carrier, Stripe or another provider is still deciding.
 * "proof": set up, but nothing real has happened yet to show it works.
 */
export type ActivationWait = "owner" | "provider" | "proof";
export type ActivationAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "test_alert"; label: string };

export type ActivationItem = {
  id: "line" | "alerts" | "handoff" | "number" | "texting" | "payments" | "first_outcome" | "permissions";
  label: string;
  state: ActivationState;
  /** Set on every item that isn't live. */
  waitingOn?: ActivationWait;
  detail: string;
  action?: ActivationAction;
};

/** The first job a person marked done with what happened, on a real (not test-mode) shop. */
export type FirstOutcome = { at: Date | string; title: string } | null;

export type LatestAlert = { channel: string; status: string; deliveryStatus: string | null; at: Date | string } | null;

function lastFour(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : "";
}

export function activationChecklist(input: {
  lineVerifiedAt: Date | string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerSmsOptOutAt: Date | string | null;
  latestAlert: LatestAlert;
  transferPhone: string | null;
  transferProvenAt: Date | string | null;
  connection: ConnectionHealth;
  level: PermissionLevel;
  /** Omitted when card payments aren't open on this deployment, so no owner is sent to a dead end. */
  payments?: ConnectState | null;
  /** Customer and technician texting; omitted by callers that don't check it. */
  texting?: TextingEligibility | null;
  /** Omitted by callers that don't look; null when no job has been verified done yet. */
  firstOutcome?: FirstOutcome;
}): ActivationItem[] {
  const alert = input.latestAlert;
  const alertDelivered = alert && alert.deliveryStatus === "delivered";
  /* An email provider accepting a message is not a delivery receipt. */
  const alertEmailed = alert && alert.status === "sent" && alert.channel === "email";
  const alertReached = alertDelivered || alertEmailed;
  const alertSent = alert && alert.status === "sent";
  const alertFailed = alert && (alert.status === "failed" || alert.deliveryStatus === "failed" || alert.deliveryStatus === "undelivered");
  const where = input.ownerPhone ? `your mobile ${lastFour(input.ownerPhone)}` : input.ownerEmail ? "your email" : null;

  const alerts: ActivationItem = input.ownerSmsOptOutAt
    ? {
        id: "alerts",
        label: "Alerts to you",
        state: "off",
        waitingOn: "owner",
        detail: "You replied STOP, so alert texts are paused. Text START to your Orvius number to turn them back on.",
      }
    : !where
      ? {
          id: "alerts",
          label: "Alerts to you",
          state: "todo",
          waitingOn: "owner",
          detail: "Add your mobile so new requests and emergencies reach you.",
          action: { kind: "link", label: "Add your mobile", href: "/dashboard?settings=notifications" },
        }
      : alertReached
        ? {
            id: "alerts",
            label: "Alerts to you",
            state: "live",
            detail: alertDelivered
              ? `Confirmed delivered to ${where}.`
              : `Emailed ${input.ownerEmail ?? "you"}: the mail service accepted it, which isn't proof it arrived. Check your inbox and spam folder.`,
          }
        : alertFailed
          ? {
              id: "alerts",
              label: "Alerts to you",
              state: "todo",
              waitingOn: "owner",
              detail: `The last alert to ${where} didn't arrive. Check the number, then send a test.`,
              action: { kind: "test_alert", label: "Send a test alert" },
            }
          : {
              id: "alerts",
              label: "Alerts to you",
              state: "todo",
              waitingOn: alertSent ? "provider" : "owner",
              detail: alertSent
                ? `Sent to ${where}; the carrier hasn't confirmed delivery yet. Send a test and check your phone.`
                : `Alerts go to ${where}. Send a test to see one arrive.`,
              action: { kind: "test_alert", label: "Send a test alert" },
            };

  const handoff: ActivationItem = input.transferPhone
    ? input.transferProvenAt
      ? {
          id: "handoff",
          label: "Callers who want a person",
          state: "live",
          detail: `Connected to ${lastFour(input.transferPhone)} — a real call was transferred.`,
        }
      : {
          id: "handoff",
          label: "Callers who want a person",
          state: "todo",
          waitingOn: "proof",
          detail: `Transferred to ${lastFour(input.transferPhone)}. Prove it: call your Orvius line and say "I'd like to talk to a person."`,
          action: { kind: "link", label: "Change the number", href: "/dashboard?settings=receptionist" },
        }
    : {
        id: "handoff",
        label: "Callers who want a person",
        state: "live",
        detail: "Orvius takes their details, tells them someone will call back and alerts you. Add a transfer number to connect them live instead.",
        action: { kind: "link", label: "Add a transfer number", href: "/dashboard?settings=receptionist" },
      };

  const number: ActivationItem =
    input.connection.state === "proven"
      ? { id: "number", label: "Your business number", state: "live", detail: input.connection.detail }
      : {
          id: "number",
          label: "Your business number",
          state: "todo",
          waitingOn: "owner",
          detail:
            input.connection.state === "test_failed"
              ? `${input.connection.detail} Your customers' calls don't reach Orvius yet.`
              : "Your customers still call your business number. Connect it — you keep the number and choose which calls Orvius takes.",
          action: { kind: "link", label: "Connect your number", href: "/dashboard?settings=phone" },
        };

  const level = PERMISSION_LEVELS.find((l) => l.id === input.level) ?? PERMISSION_LEVELS[0];

  const pay = input.payments ? paymentsActivation(input.payments) : null;
  const payments: ActivationItem[] = pay
    ? [
        {
          id: "payments",
          label: "Getting paid",
          state: pay.state,
          ...(pay.state === "live" ? {} : { waitingOn: input.payments === "verifying" ? ("provider" as const) : ("owner" as const) }),
          detail: pay.detail,
          ...(pay.action ? { action: { kind: "link" as const, label: pay.action.label, href: pay.action.href } } : {}),
        },
      ]
    : [];

  const texting: ActivationItem[] = input.texting ? [textingItem(input.texting)] : [];

  const firstOutcome: ActivationItem[] =
    input.firstOutcome === undefined
      ? []
      : [
          input.firstOutcome
            ? {
                id: "first_outcome",
                label: "First job done start to finish",
                state: "live",
                detail: `"${input.firstOutcome.title}" was marked done by a person, with what happened.`,
              }
            : {
                id: "first_outcome",
                label: "First job done start to finish",
                state: "todo",
                waitingOn: "proof",
                detail: "Not verified yet. It counts once a job Orvius booked is marked done by you or the technician, with what happened.",
              },
        ];

  return [
    {
      id: "line",
      label: "Your Orvius line",
      state: input.lineVerifiedAt ? "live" : "todo",
      ...(input.lineVerifiedAt ? {} : { waitingOn: "owner" as const }),
      detail: input.lineVerifiedAt ? "Answering. A real call came through." : "Call it once to prove it answers.",
    },
    alerts,
    handoff,
    number,
    ...texting,
    ...payments,
    ...firstOutcome,
    {
      id: "permissions",
      label: "What Orvius does on its own",
      state: "live",
      detail: `${level.title}: ${level.line} Emergencies and anything unsure always go to a person.`,
      action: { kind: "link", label: "Change", href: "/dashboard?settings=receptionist" },
    },
  ];
}

const TEXTING_HREF = "/dashboard?settings=integrations";

function textingItem(t: TextingEligibility): ActivationItem {
  const base = { id: "texting" as const, label: "Texts to customers and technicians" };
  if (t.ok) {
    return { ...base, state: "live", detail: t.via === "own" ? "Your texting registration is approved by the carriers." : "Sent from Orvius's carrier-verified number." };
  }
  if (t.reason === "own_campaign_failed") {
    return { ...base, state: "todo", waitingOn: "owner", detail: `${t.detail} Texts are held, not sent. Call customers meanwhile.`, action: { kind: "link", label: "Fix the registration", href: TEXTING_HREF } };
  }
  return { ...base, state: "todo", waitingOn: "provider", detail: `${t.detail} Calls, booking and alerts to you work meanwhile.` };
}

/** The one thing to do next: the first item only the owner can move, in the order above. */
export function nextActivationStep(items: ActivationItem[]): ActivationItem | null {
  return items.find((i) => i.state !== "live" && i.waitingOn === "owner") ?? null;
}

export function activationSummary(items: ActivationItem[]): { live: number; todo: number; headline: string; next: ActivationItem | null } {
  const live = items.filter((i) => i.state === "live").length;
  const todo = items.filter((i) => i.state !== "live").length;
  return {
    live,
    todo,
    next: nextActivationStep(items),
    headline: todo ? `${live} of ${items.length} on. ${todo === 1 ? "One thing" : `${todo} things`} left before you count on it.` : "Everything is on and proven.",
  };
}
