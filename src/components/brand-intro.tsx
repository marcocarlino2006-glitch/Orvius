type BrandIntroProps = {
  kicker?: string;
  title: string;
  subline?: string;
  description?: string;
  align?: "center" | "left";
  titleClassName?: string;
  className?: string;
};

/** Unified marketing typography — matches homepage section headers. */
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
      {kicker ? <p className="home-platform-kicker font-sans">{kicker}</p> : null}
      <h1 className={`marketing-hero-title font-sans ${titleClassName}`.trim()}>
        {title}
      </h1>
      {subline ? (
        <p className="home-platform-lead font-sans brand-intro-subline">{subline}</p>
      ) : null}
      {description ? (
        <p className="home-platform-lead font-sans brand-intro-description">{description}</p>
      ) : null}
    </div>
  );
}
