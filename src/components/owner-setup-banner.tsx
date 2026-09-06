"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
        const business = data.business;

        const line =
          business.vapiPhoneNumber?.trim() ||
          business.twilioPhone?.trim() ||
          null;
        if (!line) {
          setHref("/dashboard/onboarding");
          setLabel("Finish setup — get your shop line");
          return;
        }
        if (!business.ownerPhone?.trim()) {
          setHref("/dashboard/settings");
          setLabel("Add your mobile so alerts reach you");
          return;
        }
        if (!business.overflowForwardConfirmedAt) {
          setHref("/dashboard/settings#overflow-forward");
          setLabel("Set call capture — forward or publish your Orvius number");
          return;
        }
        if (!business.lineVerifiedAt) {
          setHref("/dashboard/settings#overflow-forward");
          setLabel("Prove your line — place one test call");
          return;
        }
        setHref(null);
        setLabel(null);
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
