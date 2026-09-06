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
      <div className="onboarding-loading" aria-busy="true" aria-label="Loading workspace">
        <aside className="onboarding-loading-rail" aria-hidden>
          <div className="onboarding-loading-mark" />
          <div className="onboarding-loading-rail-lines">
            <span className="skeleton onboarding-skel-line" />
            <span className="skeleton onboarding-skel-line onboarding-skel-short" />
            <span className="skeleton onboarding-skel-line" />
            <span className="skeleton onboarding-skel-line onboarding-skel-short" />
          </div>
        </aside>
        <div className="onboarding-loading-main">
          <div className="onboarding-loading-inner font-sans">
            <p className="onboarding-loading-kicker type-eyebrow">Orvius</p>
            <p className="onboarding-loading-copy">Opening command…</p>
            <div className="onboarding-loading-skel" aria-hidden>
              <span className="skeleton attention-skel-line attention-skel-line-lg" />
              <span className="skeleton attention-skel-line attention-skel-line-md" />
              <span className="skeleton attention-skel-line attention-skel-line-sm" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
