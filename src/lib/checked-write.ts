/*
  One answer to "did that actually happen?" for every button that changes
  something. A refusal the server gave before acting is a plain failure. No
  reply, a 5xx, or a 200 that doesn't say what happened is uncertain: the
  caller is told "Checking what happened" and the shop's own record is read
  back. Only that record, or a reply that names what was done, counts as done.
  The read-back is time-boxed, so a check that can't finish ends in "couldn't
  confirm" with a way to check again, never a control that stays disabled.
*/
import { isUncertain, WriteError } from "@/lib/client-write";

export const CHECKING = "Checking what happened…";
export const COULD_NOT_CONFIRM = "Orvius couldn't confirm whether this went through. Check again before doing it a second time.";
export const CHECKED_NOT_DONE = "Orvius checked: it didn't go through. You can try again.";

export type CheckedResult<T> =
  | { kind: "confirmed"; value: T; via: "reply" | "record" }
  | { kind: "failed"; message: string; reason: string | null }
  | { kind: "not_done"; message: string }
  | { kind: "unknown"; message: string };

/** What the record says: the effect (as T), "absent" when it provably didn't happen, or null when it can't tell yet. */
export type ReadBackAnswer<T> = T | "absent" | null;

export async function runCheckedWrite<T>(opts: {
  send: () => Promise<unknown>;
  /** The value a reply must carry to count as done; null for anything malformed or partial. */
  accept: (data: unknown) => T | null;
  readBack: () => Promise<ReadBackAnswer<T>>;
  onChecking?: () => void;
  timeoutMs?: number;
}): Promise<CheckedResult<T>> {
  try {
    const value = opts.accept(await opts.send());
    if (value !== null) return { kind: "confirmed", value, via: "reply" };
  } catch (error) {
    if (!isUncertain(error)) {
      return {
        kind: "failed",
        message: error instanceof Error ? error.message : "That wasn't accepted.",
        reason: error instanceof WriteError ? error.reason : null,
      };
    }
  }
  opts.onChecking?.();
  return checkRecord(opts.readBack, opts.timeoutMs);
}

export async function checkRecord<T>(readBack: () => Promise<ReadBackAnswer<T>>, timeoutMs = 8_000): Promise<CheckedResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const answer = await Promise.race([readBack().catch(() => null), late]);
    if (answer === "absent") return { kind: "not_done", message: CHECKED_NOT_DONE };
    if (answer === null) return { kind: "unknown", message: COULD_NOT_CONFIRM };
    return { kind: "confirmed", value: answer, via: "record" };
  } finally {
    clearTimeout(timer);
  }
}

/** A key the server stores with the effect, so a retry of the same press is recognised instead of repeated. */
export function newOperationKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
