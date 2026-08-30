/** Suggest a start time from lead urgency so booking is one tap. */
export function suggestedSchedule(urgency?: string | null): Date {
  const now = new Date();
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";

  if (key.includes("emergency")) {
    return new Date(now.getTime() + 2 * 60 * 60 * 1000);
  }

  if (key.includes("same-day") || key.includes("today")) {
    const later = new Date(now);
    later.setHours(16, 0, 0, 0);
    if (later.getTime() <= now.getTime()) {
      later.setDate(later.getDate() + 1);
      later.setHours(9, 0, 0, 0);
    }
    return later;
  }

  if (key.includes("this-week") || key.includes("week")) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 2);
  fallback.setHours(9, 0, 0, 0);
  return fallback;
}

export function jobTitle(params: {
  serviceType?: string | null;
  name?: string | null;
}): string {
  const service = params.serviceType?.trim();
  if (service) return service;
  const name = params.name?.trim();
  if (name) return `Job for ${name}`;
  return "Service job";
}
