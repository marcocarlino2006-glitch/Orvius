import type { ReactNode } from "react";

type OwnerAlertCardProps = {
  variant?: "void" | "chalk";
  className?: string;
  compact?: boolean;
  lead?: {
    name?: string;
    phone?: string;
    service?: string;
    urgency?: string;
    address?: string;
    channel?: string;
    /** Honest booking line — e.g. proposed window awaiting confirm. */
    bookingLine?: string;
  };
};

type AlertField = {
  label: string;
  value: string;
  accent?: boolean;
};

function formatUrgencyLabel(value: string) {
  if (value === "emergency") return "Emergency";
  if (value === "same-day") return "Same day";
  if (value === "this-week") return "This week";
  if (value === "flexible") return "Flexible";
  return value;
}

export function leadFromDemoForm(form: {
  callerName: string;
  callerPhone: string;
  serviceType: string;
  urgency: string;
  address: string;
}) {
  const urgency = formatUrgencyLabel(form.urgency);
  const books =
    form.urgency === "emergency" ||
    form.urgency === "same-day" ||
    form.urgency === "this-week";
  return {
    name: form.callerName,
    phone: form.callerPhone,
    service: form.serviceType,
    urgency,
    address: form.address,
    channel: "Simulated call · demo",
    bookingLine: books
      ? "Proposed window · awaiting customer confirm"
      : undefined,
  };
}

export function OwnerAlertCard({
  variant = "void",
  className = "",
  compact = false,
  lead,
}: OwnerAlertCardProps) {
  const isVoid = variant === "void";

  const name = lead?.name ?? "Maria Lopez";
  const phone = lead?.phone ?? "+1 512 555 0123";
  const service = lead?.service ?? "AC not cooling";
  const urgency = lead?.urgency ?? "Emergency";
  const address = lead?.address ?? "1842 Oak Street";
  const channel = lead?.channel ?? "Inbound call · after hours";
  const bookingLine = lead?.bookingLine;
  const isEmergency = urgency.toLowerCase().includes("emergency");

  const fields: AlertField[] = [
    { label: "Phone", value: phone },
    { label: "Service", value: service },
    { label: "Urgency", value: urgency, accent: isEmergency },
    { label: "Address", value: address },
    ...(bookingLine
      ? [{ label: "Booking", value: bookingLine, accent: true as const }]
      : []),
  ];

  return (
    <section
      className={`owner-alert owner-alert--${isVoid ? "void" : "chalk"}${
        isEmergency ? " owner-alert--critical" : ""
      }${compact ? " owner-alert--compact" : ""} ${className}`.trim()}
    >
      <header className="owner-alert-head">
        <p className="owner-alert-kicker font-sans">
          <span className="owner-alert-dot" aria-hidden />
          Owner alert
        </p>
        <span className="owner-alert-time font-sans">just now</span>
      </header>

      <div className="owner-alert-body">
        <p className="owner-alert-title font-sans">New lead from {name}</p>
        <p className="owner-alert-channel font-sans">{channel}</p>

        <dl className="os-kv owner-alert-kv font-sans">
          {fields.map(({ label, value, accent }) => (
            <div key={label} className={accent ? "owner-alert-kv-accent" : undefined}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {!compact ? (
          <p className="owner-alert-foot font-sans">
            Orvius captured this while the owner was on a job.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function CallTranscriptProof({
  variant = "void",
  className = "",
}: {
  variant?: "void" | "chalk";
  className?: string;
}) {
  const isVoid = variant === "void";

  return (
    <div
      className={`owner-alert owner-alert--${isVoid ? "void" : "chalk"} ${className}`.trim()}
    >
      <header className="owner-alert-head">
        <p className="owner-alert-kicker font-sans">Front door</p>
      </header>
      <div className="owner-alert-body owner-alert-transcript font-sans">
        <p className="transcript-line">
          <span>Orvius</span> · Thanks for calling Summit HVAC. How can I help?
        </p>
        <p className="transcript-line">
          <span>Caller</span> · My AC stopped cooling. Can someone come today?
        </p>
        <p className="transcript-line">
          <span>Orvius</span> · I can help. What&apos;s the address and best
          callback number?
        </p>
        <p className="owner-alert-foot">Lead captured · owner notified</p>
      </div>
    </div>
  );
}

export function SectionEyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`home-os-kicker ${className}`}>{children}</p>;
}
