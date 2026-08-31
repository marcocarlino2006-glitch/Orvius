"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type OnboardingStatus = {
  complete: boolean;
};

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const onOnboarding = pathname === "/dashboard/onboarding";

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) {
          if (!cancelled) setStatus("ready");
          return;
        }

        const json = (await res.json()) as OnboardingStatus;
        if (cancelled) return;

        if (!json.complete && !onOnboarding) {
          router.replace("/dashboard/onboarding");
          return;
        }

        if (json.complete && onOnboarding) {
          router.replace("/dashboard");
          return;
        }

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("ready");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [onOnboarding, pathname, router]);

  if (status === "loading") {
    return (
      <div className="onboarding-loading">
        <div className="onboarding-loading-inner font-sans">
          <span className="onboarding-loading-dot" aria-hidden />
          Loading workspace…
        </div>
      </div>
    );
  }

  return children;
}
