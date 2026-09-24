"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

type OnboardingStatus = {
  complete: boolean;
  provisioned: boolean;
  ready: boolean;
  setup?: {
    nextStep?: "line" | "owner_phone" | "capture" | "verify" | "done";
  } | null;
};

const READY_KEY = "orvius:workspace-ready";

function rememberReady(ready: boolean) {
  try {
    if (ready) sessionStorage.setItem(READY_KEY, "1");
    else sessionStorage.removeItem(READY_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Keep unfinished shops in the setup tunnel.
 * A shop that already passed this browser session renders at once and is
 * re-checked in the background, so pages don't wait on this request to start
 * loading their own data.
 * owner_phone is the only step that belongs in Settings.
 */
export function OnboardingGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(READY_KEY) === "1") setStatus("ready");
    } catch {
      /* private mode */
    }
  }, []);
  const onOnboarding = pathname === "/dashboard/onboarding";
  const onSettings = pathname.startsWith("/dashboard/settings");

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
        rememberReady(json.ready);

        if (!json.provisioned && !onOnboarding) {
          router.replace("/dashboard/onboarding");
          return;
        }

        if (json.provisioned && !json.ready && !onOnboarding) {
          const next = json.setup?.nextStep ?? "line";
          if (next === "owner_phone") {
            const settingsOpen =
              onSettings || new URLSearchParams(window.location.search).has("settings");
            if (!settingsOpen) {
              router.replace("/dashboard?settings=notifications");
              return;
            }
          } else if (next !== "done") {
            router.replace("/dashboard/onboarding");
            return;
          }
        }

        if (json.ready && onOnboarding) {
          router.replace("/dashboard?live=1");
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
  }, [onOnboarding, onSettings, pathname, router]);

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
