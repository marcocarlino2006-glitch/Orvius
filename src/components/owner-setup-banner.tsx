"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getOwnerSetupStatus,
  ownerSetupHref,
} from "@/lib/owner-setup-state";

type SetupBusiness = {
  ownerPhone?: string | null;
  twilioPhone?: string | null;
  vapiPhoneNumber?: string | null;
  overflowForwardConfirmedAt?: string | null;
  lineVerifiedAt?: string | null;
};

/**
 * Soft banner when capture/verify isn't done — doesn't block the dashboard.
 */
export function OwnerSetupBanner() {
  const [href, setHref] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/account");
        if (!res.ok) return;
        const data = (await res.json()) as { business?: SetupBusiness | null };
        if (cancelled || !data.business) return;
        const setup = getOwnerSetupStatus(data.business);
        const labels = {
          line: "Finish setup — get your shop line",
          owner_phone: "Add your mobile so alerts reach you",
          verify: "Prove your line — place one test call",
          capture: "Confirm call capture — forward or publish is live",
          done: null,
        } as const;
        setHref(setup.ready ? null : ownerSetupHref(setup.nextStep));
        setLabel(labels[setup.nextStep]);
      } catch {
        /* ignore */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!href || !label) return null;

  return (
    <div className="owner-setup-banner font-sans" role="status">
      <p className="owner-setup-banner-copy">{label}</p>
      <Link href={href} className="btn btn-void text-sm">
        Continue setup
      </Link>
    </div>
  );
}
