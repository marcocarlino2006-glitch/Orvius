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
      {kicker ? <p className="home-brand-kicker font-sans">{kicker}</p> : null}
      <h1
        className={`${align === "center" ? "home-display" : "brand-intro-title"} font-serif ${titleClassName}`}
      >
        {title}
      </h1>
      {subline ? (
        <p className="home-os-subline font-sans">{subline}</p>
      ) : null}
      {description ? (
        <p className="home-trust font-sans">{description}</p>
      ) : null}
    </div>
  );
}
