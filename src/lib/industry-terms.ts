import { industryKind, isTrade } from "@/lib/trades";

/**
 * The words the dashboard uses for the business's own work. A dentist books
 * appointments with a team, not jobs dispatched to technicians; field trades
 * keep the words they've always seen.
 */
export type IndustryTerms = {
  job: string;
  jobs: string;
  Jobs: string;
  worker: string;
  workers: string;
  Dispatch: string;
};

const FIELD: IndustryTerms = {
  job: "job",
  jobs: "jobs",
  Jobs: "Jobs",
  worker: "tech",
  workers: "techs",
  Dispatch: "Dispatch",
};

const OFFICE: IndustryTerms = {
  job: "appointment",
  jobs: "appointments",
  Jobs: "Appointments",
  worker: "team member",
  workers: "team",
  Dispatch: "Schedule",
};

export function industryTerms(trade: string | null | undefined): IndustryTerms {
  return isTrade(trade) && industryKind(trade) === "office" ? OFFICE : FIELD;
}
