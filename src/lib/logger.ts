type LogFields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = JSON.stringify(payload);
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

export function logError(event: string, fields?: LogFields) {
  write("error", event, fields);
}
