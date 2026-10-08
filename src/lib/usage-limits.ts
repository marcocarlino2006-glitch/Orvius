/*
  The hard limits a shop can run into. The code that enforces each one imports
  it from here, and so does the pricing page, so what we publish is what runs.
*/

/** One caller ringing more than this many times in an hour is told the shop will call back. */
export const CALLER_HOURLY_LIMIT = 10;

/** A shop line past this many calls in 24 hours is a runaway, not a busy day. */
export const DEFAULT_SHOP_DAILY_CEILING = 1_000;

/** Ask questions answered by the model per shop per day; past it, Ask answers from the shop's own numbers only. */
export const DEFAULT_ASK_DAILY_LIMIT = 150;

/** Days a canceled shop keeps its number, so coming back doesn't mean a new number on every truck. */
export const LINE_RETENTION_DAYS = 30;
