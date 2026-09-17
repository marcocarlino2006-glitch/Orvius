/**
 * P13 — owner opted out of SMS.
 * Alerts are dead until they text START or fix the number in settings.
 */

export function ownerAlertsAreMuted(input: {
  ownerSmsOptOutAt?: Date | string | null;
}): boolean {
  return Boolean(input.ownerSmsOptOutAt);
}
