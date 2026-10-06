export type BusinessMetrics = {
  callsToday: number;
  leadsToday: number;
  newLeads: number;
  totalCalls: number;
  totalLeads: number;
  leadBookingRate: number | null;
  lastCallAt: string | null;
  lastCaller: string | null;
};

/** Counts the shell shows on the rail so an owner never has to open a screen to look. */
export type BusinessSignals = {
  unassignedJobs: number;
  jobsToday: number;
  lineVerified: boolean;
  alertsFailed24h: number;
  /*
    Whether the clock is currently outside the shop's own configured hours —
    decided on the server against hoursJson and the shop's timezone, because a
    shop that answers until eight should not be told it is after hours at six.
  */
  afterHoursNow: boolean;
  /** Work waiting on a person — the same number Command and the Work screen show. */
  needsYou: number;
};

export type BusinessSnapshot = {
  name: string;
  trade: string | null;
  line: string | null;
  ownerPhone: string | null;
  /** Demo or reference workspace: calls are simulated, so no line is owed. */
  sample?: boolean;
  metrics: BusinessMetrics;
  signals: BusinessSignals;
};
