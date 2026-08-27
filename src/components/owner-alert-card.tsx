import Link from "next/link";

type OwnerAlertCardProps = {
  variant?: "void" | "chalk";
  className?: string;
};

export function OwnerAlertCard({
  variant = "void",
  className = "",
}: OwnerAlertCardProps) {
  const isVoid = variant === "void";

  return (
    <div
      className={`product-surface ${isVoid ? "product-surface-void" : "product-surface-chalk"} ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-rule-dark px-5 py-3.5 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-flare opacity-40" />
            <span className="relative inline-flex size-2 rounded-full bg-flare" />
          </span>
          <p className="font-sans text-[11px] font-semibold tracking-[0.2em] text-flare uppercase">
            Owner alert
          </p>
        </div>
        <span className="font-sans text-[11px] text-ash-soft">just now</span>
      </div>

      <div className="px-5 py-5 md:px-6 md:py-6">
        <p
          className={`font-serif text-2xl tracking-[-0.03em] md:text-[1.75rem] ${
            isVoid ? "text-chalk" : "text-void"
          }`}
        >
          New lead from Maria Lopez
        </p>
        <p className="mt-1.5 font-sans text-sm text-ash-soft">
          Inbound call · Summit HVAC line
        </p>

        <dl className="mt-6 space-y-0 font-sans text-sm">
          {[
            ["Phone", "+1 512 555 0123"],
            ["Service", "AC not cooling"],
            ["Urgency", "Emergency"],
            ["Address", "1842 Oak Street"],
          ].map(([label, value], i, arr) => (
            <div
              key={label}
              className={`flex justify-between gap-4 py-3 ${
                i < arr.length - 1
                  ? isVoid
                    ? "border-b border-white/8"
                    : "border-b border-rule"
                  : ""
              }`}
            >
              <dt className="text-ash-soft">{label}</dt>
              <dd
                className={`text-right font-medium ${
                  label === "Urgency" ? "text-flare" : isVoid ? "text-chalk" : "text-void"
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="btn btn-on-void pointer-events-none text-sm">
            Call back
          </span>
          <span className="font-sans text-xs text-ash-soft">
            Orvius captured this while you were on a job
          </span>
        </div>
      </div>
    </div>
  );
}

export function HomeHeroProduct() {
  return (
    <OwnerAlertCard
      variant="void"
      className="anim-rise anim-rise-delay-2 w-full max-w-md lg:max-w-none lg:justify-self-end"
    />
  );
}

export function SectionEyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`eyebrow ${className}`}
    >
      {children}
    </p>
  );
}
