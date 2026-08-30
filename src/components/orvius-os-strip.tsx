import { osRings } from "@/lib/company";

type OrviusOsStripProps = {
  variant?: "light" | "dark" | "hero" | "rail";
  showNext?: boolean;
};

export function OrviusOsStrip({
  variant = "light",
  showNext = true,
}: OrviusOsStripProps) {
  const rings = osRings.filter(
    (ring) => ring.status === "live" || (showNext && ring.status === "next"),
  );

  if (variant === "rail") {
    return (
      <div className="orvius-rail font-sans" aria-label="Orvius OS modules">
        {rings.map((ring, index) => {
          const isLive = ring.status === "live";
          return (
            <span key={ring.ring} className="orvius-rail-item">
              {index > 0 ? <span className="orvius-rail-sep" aria-hidden>·</span> : null}
              <span className={isLive ? "orvius-rail-live" : "orvius-rail-next"}>
                {ring.name}
                {isLive ? (
                  <span className="orvius-rail-dot" aria-hidden />
                ) : (
                  <span className="orvius-rail-tag">Next</span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  const stripVariant = variant === "hero" ? "hero" : variant === "dark" ? "dark" : "light";

  return (
    <div
      className={`orvius-os-strip orvius-os-strip-${stripVariant}`}
      aria-label="Orvius OS modules"
    >
      {rings.map((ring) => {
        const isLive = ring.status === "live";

        return (
          <div
            key={ring.ring}
            className={`orvius-os-strip-item ${isLive ? "orvius-os-strip-live" : "orvius-os-strip-next"}`}
          >
            <span className="orvius-os-strip-num font-sans">
              {String(ring.ring).padStart(2, "0")}
            </span>
            <span className="orvius-os-strip-name font-serif">{ring.name}</span>
            <span
              className={`orvius-os-strip-badge font-sans ${isLive ? "" : "orvius-os-strip-badge-next"}`}
            >
              {isLive ? "Live" : "Next"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
