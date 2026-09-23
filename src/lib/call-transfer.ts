/**
 * Vapi transferCall tool — live handoff to the shop owner cell.
 * Blind transfer with spoken fallback if the owner doesn't answer.
 */

import { normalizePhone } from "@/lib/customer";

export type TransferCallTool = {
  type: "transferCall";
  destinations: Array<{
    type: "number";
    number: string;
    description: string;
    message: string;
    transferPlan: {
      mode: "warm-transfer-experimental";
      fallbackPlan: {
        message: string;
        endCallEnabled: false;
      };
    };
  }>;
  messages: Array<{ type: string; content: string }>;
};

/**
 * Build the transferCall tool when we have a real owner cell.
 * Returns null if the number is missing/invalid — assistant stays board-only.
 */
export function buildOwnerTransferTool(
  ownerPhone: string | null | undefined,
): TransferCallTool | null {
  const number = normalizePhone(ownerPhone ?? "");
  if (!number) return null;

  return {
    type: "transferCall",
    destinations: [
      {
        type: "number",
        number,
        description:
          "Shop owner cell — transfer when the caller asks for a person and agrees to be connected now",
        message: "Transferring you to the owner now. Please hold.",
        transferPlan: {
          mode: "warm-transfer-experimental",
          fallbackPlan: {
            message:
              "I couldn't reach the owner live. I'll take your info and have them call you back shortly.",
            endCallEnabled: false,
          },
        },
      },
    ],
    messages: [
      {
        type: "request-start",
        content: "Calling the owner now. Please hold.",
      },
      {
        type: "request-failed",
        content:
          "I couldn't start the transfer. I'll take your details for a callback instead.",
      },
    ],
  };
}

export function transferPromptRule(hasTransfer: boolean): string {
  if (hasTransfer) {
    return `- If caller asks for a person: offer to connect them to the owner now. If they agree, use the transferCall tool immediately (do not invent a booking). If they prefer a callback, or transfer fails / owner does not answer, capture name + callback and put exactly this in notes: "Owner missed transfer — callback" (or "Caller asked for a person — callback" if they declined the live connect).`;
  }
  return `- If caller asks for a person: "I can have the owner call you back within 15 minutes. What's the best number?" Capture name + callback. Put exactly this in notes: "Caller asked for a person — callback". Do not invent a booking.`;
}
