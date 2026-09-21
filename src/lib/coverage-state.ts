/** Shop coverage snapshot — after-hours window + forward proof. */
export type CoverageState = {
  afterHoursNow: boolean;
  timezone: string | null;
  forwardConfirmed: boolean;
};
