import { OrviusLogo } from "@/components/orvius-logo";

type BrandIntroProps = {
  kicker?: string;
  title: string;
  subline?: string;
  description?: string;
  align?: "center" | "left";
  titleClassName?: string;
  className?: string;
  /** Institutional brand mass for secondary marketing heroes */
  brand?: boolean;
};

export function BrandIntro({
  kicker,
  title,
  subline,
  description,
  align = "center",
  titleClassName = "",
  className = "",
  brand = false,
}: BrandIntroProps) {
  const alignClass = align === "center" ? "brand-intro-center" : "brand-intro-left";

  return (
    <div className={`brand-intro ${alignClass} ${className}`.trim()}>
      {brand ? (
        <div className="brand-intro-mark">
          <OrviusLogo variant="void" size="lg" />
        </div>
      ) : null}
      {kicker ? <p className="tier1-eyebrow type-eyebrow">{kicker}</p> : null}
      <h1 className={`tier1-page-title type-headline ${titleClassName}`.trim()}>
        {title}
      </h1>
      {subline ? (
        <p className="tier1-section-lead font-sans brand-intro-subline">{subline}</p>
      ) : null}
      {description ? (
        <p className="tier1-section-lead font-sans brand-intro-description">{description}</p>
      ) : null}
    </div>
  );
}
