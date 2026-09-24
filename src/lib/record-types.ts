export type RecordType = "call" | "lead" | "customer" | "job";

export const RECORD_TYPES: RecordType[] = ["call", "lead", "customer", "job"];

export function isRecordType(value: string): value is RecordType {
  return (RECORD_TYPES as string[]).includes(value);
}

export type PathNodeType =
  | "call"
  | "lead"
  | "customer"
  | "property"
  | "job"
  | "technician"
  | "estimate"
  | "invoice"
  | "payment";

export type PathNode = {
  type: PathNodeType;
  label: string;
  /** Null when this step of the graph does not exist yet. */
  value: string | null;
  recordType?: RecordType;
  recordId?: string;
};

export type RecordEvent = {
  at: string;
  label: string;
  detail?: string | null;
  tone: "neutral" | "success" | "attention" | "risk";
};

export type RecordView = {
  type: RecordType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  source: { channel: string; from: string | null; at: string } | null;
  summary: string | null;
  transcript: string | null;
  captured: Array<{ label: string; value: string | null }>;
  decisions: string[];
  events: RecordEvent[];
  path: PathNode[];
  next: { label: string; href: string; detail: string } | null;
  fullHref: string;
  history?: Array<{
    type: RecordType;
    id: string;
    title: string;
    at: string;
    status: string | null;
  }>;
};

export function recordHref(type: RecordType, id: string): string {
  switch (type) {
    case "call":
      return `/dashboard/calls/${id}`;
    case "lead":
      return `/dashboard/inbox/${id}`;
    case "customer":
      return `/dashboard/customers/${id}`;
    case "job":
      return `/dashboard/jobs/${id}`;
  }
}
