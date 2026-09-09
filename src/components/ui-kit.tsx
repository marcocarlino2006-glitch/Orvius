import Link from "next/link";

/**
 * Colorway-aware primitives. Every one of these reads --ui-* tokens, so the
 * same element renders correctly on the pitch-dark canvas and the warm paper
 * canvas without a per-theme variant at the call site.
 */

type PillVariant = "solid" | "quiet" | "ghost";

const PILL_BASE =
  "ui-pill inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ui-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

/** Solid inverts against the canvas, which is what makes it read as the one CTA. */
const PILL_VARIANTS: Record<PillVariant, string> = {
  solid: "bg-ui-cta text-ui-on-cta hover:opacity-90",
  quiet:
    "border border-ui-border bg-ui-surface text-ui-text shadow-[var(--ui-lip)] hover:bg-ui-surface-hover",
  ghost: "text-ui-muted hover:bg-ui-surface-hover hover:text-ui-text",
};

function pillClass(variant: PillVariant, className: string) {
  return [PILL_BASE, PILL_VARIANTS[variant], className].filter(Boolean).join(" ");
}

export function PillButton({
  variant = "solid",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PillVariant }) {
  return (
    <button type="button" className={pillClass(variant, className)} {...rest}>
      {children}
    </button>
  );
}

export function PillLink({
  href,
  variant = "solid",
  className = "",
  children,
  ...rest
}: React.ComponentPropsWithoutRef<typeof Link> & { variant?: PillVariant }) {
  return (
    <Link href={href} className={pillClass(variant, className)} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Grid card with a lit 1px top lip. The inner highlight is what gives the
 * surface its metallic read on dark — a drop shadow would just look like 2014
 * material elevation.
 */
export function SurfaceCard({
  interactive = false,
  className = "",
  children,
}: {
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-ui-border bg-ui-surface p-5 shadow-[var(--ui-lip)]",
        interactive ? "transition-colors duration-200 hover:bg-ui-surface-hover" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-ui-text">{children}</p>;
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-sm leading-relaxed text-ui-muted">{children}</p>;
}

/**
 * Micro-badge for live feeds. The pulse is decorative, so it stops for anyone
 * who asked the OS to reduce motion, and the label carries the meaning.
 */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse ${className}`.trim()}
      aria-hidden
    />
  );
}

export function LiveBadge({
  label = "Live",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-ui-border bg-ui-surface px-2.5 py-1 font-mono text-[11px] tracking-wide text-ui-muted uppercase ${className}`.trim()}
    >
      <LiveDot />
      {label}
    </span>
  );
}
