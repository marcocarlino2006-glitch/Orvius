import Link from "next/link";

type HomeHeroActionsProps = {
  variant?: "light" | "void";
};

export function HomeHeroActions({ variant = "light" }: HomeHeroActionsProps) {
  const linkClass = variant === "void" ? "editorial-link-on-void" : "editorial-link";

  return (
    <div className="editorial-actions font-sans">
      <Link href="/pilot" className="editorial-cta">
        Get started
      </Link>
      <Link href="/demo" className={linkClass}>
        Watch demo
      </Link>
    </div>
  );
}
