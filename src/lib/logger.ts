type LogFields = Record<string, unknown>;

/*
  Logs and Sentry keep a caller's number for months in systems no customer
  agreed to; masking every E.164 number here covers fields and error messages
  alike. Area code and last four stay, which is what debugging needs.
*/
const E164 = /\+(1\d{3}|\d{2,4})(\d{3,8})(\d{4})\b/g;

export function redactPhones(text: string): string {
  return text.replace(E164, (_all, lead: string, middle: string, last: string) => `+${lead}${"•".repeat(middle.length)}${last}`);
}

function redactFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return fields;
  try {
    return JSON.parse(redactPhones(JSON.stringify(fields))) as LogFields;
  } catch {
    return fields;
  }
}

function write(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = redactPhones(JSON.stringify(payload));
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function logInfo(event: string, fields?: LogFields) {
  write("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  write("warn", event, fields);
}

/**
 * Errors are the failures an owner would feel — a line that did not provision,
 * an alert that did not deliver — so they also go to Sentry when a DSN is set.
 * Imported lazily so scripts and tests that log never load the SDK.
 */
export function logError(event: string, fields?: LogFields) {
  write("error", event, fields);
  if (!process.env.SENTRY_DSN?.trim() && !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  void import("@/lib/sentry-report")
    .then(({ captureServerMessage }) =>
      captureServerMessage(event, { surface: event.split(".")[0] ?? "server" }, { level: "error", extra: redactFields(fields) }),
    )
    .catch(() => {});
}
