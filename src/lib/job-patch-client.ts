/**
 * Every schedule edit from the owner's screens goes through here. The server
 * refuses a move or reassignment that clashes (closed day, busy calendar, the
 * tech off or already booked, nobody free) and says why; the person can still
 * do it after seeing the reason, and that override lands in the job's history.
 */
export function patchJob(jobId: string, body: Record<string, unknown>): Promise<Response> {
  return sendWithClashConfirm(`/api/jobs/${jobId}`, "PATCH", body);
}

/** Booking a request at a chosen time runs the same check. */
export function bookJob(body: Record<string, unknown>): Promise<Response> {
  return sendWithClashConfirm("/api/jobs", "POST", body);
}

async function sendWithClashConfirm(url: string, method: "PATCH" | "POST", body: Record<string, unknown>): Promise<Response> {
  const send = (extra: Record<string, unknown> = {}) =>
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ...extra }),
    });
  const res = await send();
  if (res.status !== 409) return res;
  const data = (await res.clone().json().catch(() => null)) as { error?: string; clash?: boolean } | null;
  if (!data?.clash || !window.confirm(`${data.error} Do it anyway?`)) return res;
  return send({ allowClash: true });
}
