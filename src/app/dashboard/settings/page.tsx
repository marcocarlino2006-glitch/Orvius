"use client";

import { OsShell } from "@/components/os-shell";
import { ProSignalBar } from "@/components/pro-signal-bar";
import { ShellPanel } from "@/components/shell-primitives";
import Link from "next/link";
import { useEffect, useState } from "react";

type AccountResponse = {
  business: {
    name: string;
    ownerPhone: string | null;
    twilioPhone: string | null;
    vapiPhoneNumber: string | null;
    billingStatus: string;
  } | null;
};

export default function DashboardSettingsPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then(setAccount)
      .catch(() => null);
  }, []);

  const business = account?.business;
  const line = business?.vapiPhoneNumber ?? business?.twilioPhone;

  return (
    <OsShell
      title="Settings"
      subtitle="Your line, receptionist, and owner alerts."
    >
      <ProSignalBar showInboxLink={false} />

      <div className="account-stack mt-6">
        <ShellPanel title="Shop line">
          <ul className="account-settings-list font-sans">
            <li>
              <div>
                <p className="account-settings-label">Inbound number</p>
                <p className="account-settings-value">{line ?? "Not configured"}</p>
              </div>
              <Link href="/admin" className="btn btn-secondary text-sm">
                Advanced
              </Link>
            </li>
            <li>
              <div>
                <p className="account-settings-label">AI receptionist</p>
                <p className="account-settings-value">
                  Greeting, hours, and services for callers
                </p>
              </div>
              <Link href="/admin" className="btn btn-secondary text-sm">
                Edit
              </Link>
            </li>
          </ul>
        </ShellPanel>

        <ShellPanel title="Owner alerts">
          <ul className="account-settings-list font-sans">
            <li>
              <div>
                <p className="account-settings-label">SMS to your mobile</p>
                <p className="account-settings-value">
                  {business?.ownerPhone ?? "Add your cell to get lead summaries"}
                </p>
              </div>
              <Link href="/admin" className="btn btn-secondary text-sm">
                Update
              </Link>
            </li>
          </ul>
          <p className="mt-4 font-sans text-xs leading-relaxed text-ash-soft">
            Reply STOP to opt out. Standard message rates may apply.
          </p>
        </ShellPanel>
      </div>
    </OsShell>
  );
}
