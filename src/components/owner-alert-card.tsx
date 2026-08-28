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
  return {
    name: form.callerName,
    phone: form.callerPhone,
    service: form.serviceType,
    urgency: formatUrgencyLabel(form.urgency),
    address: form.address,
    channel: "Simulated call · demo",
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
  const isEmergency = urgency.toLowerCase().includes("emergency");

  const fields: AlertField[] = [
    { label: "Phone", value: phone },
    { label: "Service", value: service },
    { label: "Urgency", value: urgency, accent: isEmergency },
    { label: "Address", value: address },
  ];

  return (
    <div
      className={`product-surface product-float ${isVoid ? "product-surface-void" : "product-surface-chalk"} ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-flare opacity-35" />
            <span className="relative inline-flex size-2 rounded-full bg-flare" />
          </span>
          <p className="font-sans text-[10px] font-bold tracking-[0.22em] text-flare uppercase">
            Owner alert
          </p>
        </div>
        <span className="font-sans text-[10px] tracking-wide text-ash-soft uppercase">
          just now
        </span>
      </div>

      <div className={`px-5 md:px-6 ${compact ? "py-4" : "py-5 md:py-6"}`}>
        <p
          className={`font-serif tracking-[-0.035em] ${
            compact ? "text-xl" : "text-2xl md:text-[1.75rem]"
          } ${isVoid ? "text-chalk" : "text-void"}`}
        >
          New lead from {name}
        </p>
        <p className="mt-1 font-sans text-[13px] text-ash-soft">{channel}</p>

        <dl className="mt-5 space-y-0 font-sans text-[13px]">
          {fields.map(({ label, value, accent }, i, arr) => (
            <div
              key={label}
              className={`flex justify-between gap-4 py-2.5 ${
                i < arr.length - 1
                  ? isVoid
                    ? "border-b border-white/6"
                    : "border-b border-rule"
                  : ""
              }`}
            >
              <dt className="text-ash-soft">{label}</dt>
              <dd
                className={`text-right font-medium tabular-nums ${
                  accent ? "text-flare" : isVoid ? "text-chalk" : "text-void"
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {!compact && (
          <p className="mt-5 font-sans text-[11px] leading-relaxed text-ash-soft">
            Orvius captured this while the owner was on a job.
          </p>
        )}
      </div>
    </div>
  );
}

export function CallTranscriptProof({ className = "" }: { className?: string }) {
  return (
    <div className={`panel-void p-6 md:p-8 ${className}`}>
      <p className="font-sans text-[10px] font-bold tracking-[0.22em] text-flare uppercase">
        Live receptionist
      </p>
      <div className="mt-5 space-y-4 font-sans text-[13px] leading-relaxed text-ash-soft">
        <p>
          <span className="text-chalk">Orvius</span> · Thanks for calling Summit
          HVAC. How can I help?
        </p>
        <p>
          <span className="text-chalk/80">Caller</span> · My AC stopped cooling.
          Can someone come today?
        </p>
        <p>
          <span className="text-chalk">Orvius</span> · I can help. What&apos;s the
          address and best callback number?
        </p>
      </div>
      <div className="mt-6 flex items-center gap-2 border-t border-white/8 pt-5">
        <span className="size-1.5 rounded-full bg-live" />
        <p className="font-sans text-xs text-chalk">
          Lead captured · owner notified
        </p>
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
  return <p className={`eyebrow ${className}`}>{children}</p>;
}
