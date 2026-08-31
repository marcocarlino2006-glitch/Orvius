import Link from "next/link";
import { demoLineHref } from "@/lib/demo-line";

type HomeHeroActionsProps = {
  variant?: "light" | "void";
};

export function HomeHeroActions({ variant = "light" }: HomeHeroActionsProps) {
  const callClass =
    variant === "void" ? "tier-btn tier-btn-call" : "tier-btn tier-btn-primary";
  const secondary =
    variant === "void" ? "tier-btn tier-btn-ghost" : "tier-btn tier-btn-secondary";

  return (
    <div className="tier-actions font-sans">
      <a href={demoLineHref()} className={callClass}>
        Call live demo
      </a>
      <Link href="/pilot" className={secondary}>
        Get on your line
      </Link>
    </div>
  );
}
