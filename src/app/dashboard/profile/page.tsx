"use client";

import { OsShell } from "@/components/os-shell";
import { ShellPanel } from "@/components/shell-primitives";
import Link from "next/link";
import { useEffect, useState } from "react";

type AccountResponse = {
  user: { name: string | null; email: string | null };
  business: {
    name: string;
    slug: string;
    ownerPhone: string | null;
    ownerEmail: string | null;
    twilioPhone: string | null;
    vapiPhoneNumber: string | null;
    billingStatus: string;
    createdAt: string;
  } | null;
};

export default function DashboardProfilePage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then(setAccount)
      .finally(() => setLoading(false));
  }, []);

  return (
    <OsShell
      title="Profile"
      subtitle="Your Google account and shop identity in Orvius."
    >
      <div className="account-grid">
        <ShellPanel title="Account">
          {loading ? (
            <p className="font-sans text-sm text-ash">Loading…</p>
          ) : (
            <dl className="account-dl font-sans">
              <div>
                <dt>Name</dt>
                <dd>{account?.user.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{account?.user.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Sign-in</dt>
                <dd>Google OAuth</dd>
              </div>
            </dl>
          )}
        </ShellPanel>

        <ShellPanel
          title="Business"
          action={
            <Link href="/dashboard/settings" className="pro-section-link font-sans">
              Settings →
            </Link>
          }
        >
          {loading ? (
            <p className="font-sans text-sm text-ash">Loading…</p>
          ) : account?.business ? (
            <dl className="account-dl font-sans">
              <div>
                <dt>Shop</dt>
                <dd>{account.business.name}</dd>
              </div>
              <div>
                <dt>Live line</dt>
                <dd>{account.business.twilioPhone ?? account.business.vapiPhoneNumber ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Owner phone</dt>
                <dd>{account.business.ownerPhone ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Owner email</dt>
                <dd>{account.business.ownerEmail ?? "—"}</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{new Date(account.business.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          ) : (
            <p className="font-sans text-sm leading-relaxed text-ash">
              No shop linked yet.{" "}
              <Link href="/dashboard/onboarding" className="pro-section-link">
                Complete setup
              </Link>{" "}
              to connect your line.
            </p>
          )}
        </ShellPanel>
      </div>
    </OsShell>
  );
}
