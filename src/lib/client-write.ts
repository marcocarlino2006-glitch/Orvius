/*
  What a person is told after pressing a button that changes something. A
  refusal the server answered before acting is a plain failure. No answer, a
  server error or an unreadable reply is uncertain: the change may already
  have happened, so the person checks before doing it again. Nothing here
  claims "nothing changed" unless the server said so.
*/

export const UNCERTAIN_WRITE = "Orvius didn't get an answer, so this may or may not have gone through. Refresh to check before trying again.";
export const UNREADABLE_REPLY = "It went through, but the reply didn't come back readable. Refresh to see the result before doing it again.";

export class WriteError extends Error {
  readonly uncertain: boolean;
  readonly status: number | null;
  readonly reason: string | null;
  constructor(message: string, uncertain: boolean, status: number | null, reason: string | null = null) {
    super(message);
    this.uncertain = uncertain;
    this.status = status;
    this.reason = reason;
  }
}

/** Server replies that say the change did not happen, even on a 5xx. */
const CERTAIN_REASONS = new Set(["failed_before_effect"]);

export function writeErrorFor(status: number, data: { error?: unknown; reason?: unknown } | null): WriteError {
  const reason = typeof data?.reason === "string" ? data.reason : null;
  const said = typeof data?.error === "string" && data.error.trim() ? data.error.trim() : null;
  const uncertain = (status >= 500 || status === 408) && !(reason && CERTAIN_REASONS.has(reason));
  if (!said) return new WriteError(uncertain ? UNCERTAIN_WRITE : "That wasn't accepted.", uncertain, status, reason);
  const hedged = uncertain && !/may (or may not )?have|part of it|flagged/i.test(said);
  return new WriteError(hedged ? `${said} ${UNCERTAIN_WRITE}` : said, uncertain, status, reason);
}

/** JSON in, JSON out, with the failure told truthfully. */
export async function sendWrite<T = Record<string, unknown>>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new WriteError(UNCERTAIN_WRITE, true, null);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: unknown; reason?: unknown }) | null;
  if (res.ok) {
    if (data === null) throw new WriteError(UNREADABLE_REPLY, true, res.status);
    return data;
  }
  throw writeErrorFor(res.status, data);
}

export function isUncertain(error: unknown): boolean {
  return error instanceof WriteError && error.uncertain;
}

/** Run tasks one after another, so a slow earlier reply can never land after a newer one. */
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
