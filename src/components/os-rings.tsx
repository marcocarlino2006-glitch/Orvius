import { osCurrentRing, osRings } from "@/lib/company";

type OsRingsProps = {
  variant?: "light" | "dark";
  limit?: number;
};

export function OsRings({ variant = "light", limit }: OsRingsProps) {
  const rings = limit ? osRings.slice(0, limit) : osRings;
  const isDark = variant === "dark";

  return (
    <ol className="os-rings">
      {rings.map((item) => {
        const isLive = item.ring === osCurrentRing;
        const isNext = item.status === "next";

        return (
          <li
            key={item.ring}
            className={`os-ring ${isLive ? "os-ring-live" : ""} ${isNext ? "os-ring-next" : ""} ${
              isDark ? "os-ring-dark" : "os-ring-light"
            }`}
          >
            <div className="os-ring-meta font-sans">
              <span className="os-ring-num">{String(item.ring).padStart(2, "0")}</span>
              {isLive ? <span className="os-ring-badge">Live</span> : null}
              {isNext ? <span className="os-ring-badge os-ring-badge-next">Next</span> : null}
            </div>
            <div className="os-ring-content">
              <p className="os-ring-name font-serif">{item.name}</p>
              <p className="os-ring-module font-sans">{item.module}</p>
              <p className="os-ring-body font-sans">{item.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
