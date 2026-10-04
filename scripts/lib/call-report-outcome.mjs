/**
 * The Vapi webhook answers once a call is saved and books it afterwards, so a
 * drill that posts a report waits here for the booking outcome.
 */
export async function waitForCallReport(prisma, vapiCallId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const event = await prisma.webhookEvent.findUnique({
      where: { source_externalId_eventType: { source: "vapi", externalId: vapiCallId, eventType: "end-of-call-report" } },
      select: { status: true, payloadJson: true, error: true },
    });
    if (event?.status === "processed") return JSON.parse(event.payloadJson ?? "{}");
    if (event?.status === "failed" || event?.status === "abandoned") {
      throw new Error(`call report ${vapiCallId} ${event.status}: ${event.error ?? "unknown"}`);
    }
    if (Date.now() > deadline) throw new Error(`call report ${vapiCallId} not finished after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
