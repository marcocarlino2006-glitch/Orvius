/** What a receptionist says to someone reporting a hazard. */
export const SAFETY_GUIDANCE =
  /\b911\b|leave (the|your) (house|home|building)|get (everyone )?out(side)?|step outside|shut (it |the \w+ )?off|turn (it |the \w+ )?off|breaker|gas (company|utility)|stay away|don'?t (touch|use|flip|light)|evacuat/i;

/**
 * The danger script itself: leave, call 911 or the gas company, don't touch
 * switches. Narrower than SAFETY_GUIDANCE, which also matches "turn the water
 * off" — advice that is right on an ordinary leak call.
 */
export const DANGER_INSTRUCTION =
  /\bleave (the|your) (home|house|building)\b|\bget (everyone )?out( of the (house|home))?\b|\bevacuat\w*|\b(step|go) outside\b|\b(gas (company|utility)|compa[ñn][ií]a de gas)\b|\b9 ?1 ?1\b|\bdon'?t (touch|flip|use) (any )?(light )?switch\w*|\bsalga(n)? de la casa\b|\bnueve.{0,4}(uno|once)\b/i;

/**
 * Caller words that justify the danger script even when the trade playbook
 * has no hazard for them — a gas or fire mention, or a medical emergency on
 * an office line. Erring toward these keeps a real danger call from being
 * flagged as a false alarm.
 */
export const DANGER_MENTION =
  /\b(gas|propane|carbon monoxide|co (alarm|detector)|smoke|fire|spark\w*|burning|chest pain|can'?t breathe|trouble breathing|stroke|bleeding|unconscious|suicid\w*|harm (myself|themselves)|overdose|gasolina|humo|fuego|olor a gas)\b/i;

/** "I don't smell gas" and "no hay olor a gas" deny the danger rather than report it. */
const DENIED_DANGER =
  /\b(no|not|don'?t|doesn'?t|didn'?t|isn'?t|there'?s no|never|without|nothing like|no hay|no huele a|no es)\b(\s+\w+){0,3}?\s+(gas|propane|carbon monoxide|smoke|fire|spark\w*|burning|gasolina|humo|fuego|olor a gas)\b/gi;

export function withoutDeniedDanger(text: string): string {
  return text.replace(DENIED_DANGER, " ");
}

export function mentionsDanger(text: string): boolean {
  return DANGER_MENTION.test(withoutDeniedDanger(text));
}
