type BrandIntroProps = {
  kicker?: string;
  title: string;
  subline?: string;
  description?: string;
  align?: "center" | "left";
  titleClassName?: string;
  className?: string;
};

export function BrandIntro({
  kicker,
  title,
  subline,
  description,
  align = "center",
  titleClassName = "",
  className = "",
}: BrandIntroProps) {
  const alignClass = align === "center" ? "brand-intro-center" : "brand-intro-left";

  return (
    <div className={`brand-intro ${alignClass} ${className}`.trim()}>
      {kicker ? <p className="tier1-eyebrow font-sans">{kicker}</p> : null}
      <h1 className={`tier1-page-title font-brand ${titleClassName}`.trim()}>
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
