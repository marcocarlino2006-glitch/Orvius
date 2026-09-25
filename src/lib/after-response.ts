import { after } from "next/server";

/**
 * Run work the response does not depend on after it is sent. Outside a
 * request (scripts, tests, cron) there is no response to wait for, so the
 * work runs inline instead. Errors are swallowed: callers use this only for
 * best-effort side effects.
 */
export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const safe = () => task().then(() => undefined, () => undefined);
  try {
    after(safe);
  } catch {
    await safe();
  }
}
