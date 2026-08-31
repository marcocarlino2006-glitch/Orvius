"use client";

import { HomeCallDemo } from "@/components/home-call-demo";

type HomeLiveLineProps = {
  variant?: "light" | "void";
};

/** @deprecated Prefer HomeCallDemo — kept for compatibility */
export function HomeLiveLine({ variant = "light" }: HomeLiveLineProps) {
  return (
    <HomeCallDemo
      variant={variant}
      size="compact"
      showHint={false}
    />
  );
}
