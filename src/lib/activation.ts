import type { ConnectionHealth } from "@/lib/number-connection";
import { paymentsActivation, type ConnectState } from "@/lib/payments-intro";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/setup-flow";

/*
  What is actually on after go-live, each item proven by something that
  happened rather than by a setting being saved. "todo" items say exactly what
  to do next; nothing here is stamped as working because the owner clicked.
*/

export type ActivationState = "live" | "todo" | "off";
export type ActivationAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "test_alert"; label: string };

export type ActivationItem = {
  id: "line" | "alerts" | "handoff" | "number" | "payments" | "permissions";
  label: string;
  state: ActivationState;
  detail: string;
  action?: ActivationAction;
};

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
}): ActivationItem[] {
  const alert = input.latestAlert;
  const alertReached = alert && (alert.deliveryStatus === "delivered" || (alert.status === "sent" && alert.channel === "email"));
  const alertSent = alert && alert.status === "sent";
  const alertFailed = alert && (alert.status === "failed" || alert.deliveryStatus === "failed" || alert.deliveryStatus === "undelivered");
  const where = input.ownerPhone ? `your mobile ${lastFour(input.ownerPhone)}` : input.ownerEmail ? "your email" : null;

  const alerts: ActivationItem = input.ownerSmsOptOutAt
    ? {
        id: "alerts",
        label: "Alerts to you",
        state: "off",
        detail: "You replied STOP, so alert texts are paused. Text START to your Orvius number to turn them back on.",
      }
    : !where
      ? {
          id: "alerts",
          label: "Alerts to you",
          state: "todo",
          detail: "Add your mobile so new requests and emergencies reach you.",
          action: { kind: "link", label: "Add your mobile", href: "/dashboard?settings=notifications" },
        }
      : alertReached
        ? { id: "alerts", label: "Alerts to you", state: "live", detail: `Confirmed delivered to ${where}.` }
        : alertFailed
          ? {
              id: "alerts",
              label: "Alerts to you",
              state: "todo",
              detail: `The last alert to ${where} didn't arrive. Check the number, then send a test.`,
              action: { kind: "test_alert", label: "Send a test alert" },
            }
          : {
              id: "alerts",
              label: "Alerts to you",
              state: "todo",
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
          detail: pay.detail,
          ...(pay.action ? { action: { kind: "link" as const, label: pay.action.label, href: pay.action.href } } : {}),
        },
      ]
    : [];

  return [
    {
      id: "line",
      label: "Your Orvius line",
      state: input.lineVerifiedAt ? "live" : "todo",
      detail: input.lineVerifiedAt ? "Answering. A real call came through." : "Call it once to prove it answers.",
    },
    alerts,
    handoff,
    number,
    ...payments,
    {
      id: "permissions",
      label: "What Orvius does on its own",
      state: "live",
      detail: `${level.title}: ${level.line} Emergencies and anything unsure always go to a person.`,
      action: { kind: "link", label: "Change", href: "/dashboard?settings=receptionist" },
    },
  ];
}

export function activationSummary(items: ActivationItem[]): { live: number; todo: number; headline: string } {
  const live = items.filter((i) => i.state === "live").length;
  const todo = items.filter((i) => i.state !== "live").length;
  return {
    live,
    todo,
    headline: todo ? `${live} of ${items.length} on. ${todo === 1 ? "One thing" : `${todo} things`} left before you count on it.` : "Everything is on and proven.",
  };
}
