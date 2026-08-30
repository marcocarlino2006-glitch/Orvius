import { osRings } from "@/lib/company";

type OrviusOsStripProps = {
  variant?: "light" | "dark" | "hero";
  showNext?: boolean;
};

export function OrviusOsStrip({
  variant = "light",
  showNext = true,
}: OrviusOsStripProps) {
  const rings = osRings.filter(
    (ring) => ring.status === "live" || (showNext && ring.status === "next"),
  );

  return (
    <div
      className={`orvius-os-strip orvius-os-strip-${variant}`}
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
