import Link from "next/link";

export function HomeHeroActions() {
  return (
    <div className="editorial-actions font-sans">
      <Link href="/pilot" className="editorial-cta">
        Free pilot
      </Link>
      <Link href="/demo" className="editorial-link">
        Hear a call
      </Link>
    </div>
  );
}
