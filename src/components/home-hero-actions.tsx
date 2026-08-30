import Link from "next/link";

type HomeHeroActionsProps = {
  variant?: "light" | "void";
};

export function HomeHeroActions({ variant = "light" }: HomeHeroActionsProps) {
  const secondaryClass =
    variant === "void" ? "tier-btn tier-btn-ghost" : "tier-btn tier-btn-secondary";

  return (
    <div className="tier-actions font-sans">
      <Link href="/pilot" className="tier-btn tier-btn-primary">
        Get started
      </Link>
      <Link href="/demo" className={secondaryClass}>
        Watch demo
      </Link>
    </div>
  );
}
