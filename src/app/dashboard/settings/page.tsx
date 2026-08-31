"use client";

import { OsShell } from "@/components/os-shell";
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

  return (
    <OsShell
      title="Settings"
      subtitle="Line configuration, alerts, and workspace preferences."
    >
      <div className="account-stack">
        <ShellPanel title="Front door">
          <ul className="account-settings-list font-sans">
            <li>
              <div>
                <p className="account-settings-label">Live line</p>
                <p className="account-settings-value">
                  {business?.twilioPhone ?? business?.vapiPhoneNumber ?? "Not configured"}
                </p>
              </div>
              <Link href="/admin" className="btn btn-secondary text-sm">
                Configure
              </Link>
            </li>
            <li>
              <div>
                <p className="account-settings-label">Receptionist & greeting</p>
                <p className="account-settings-value">Vapi assistant, hours, services</p>
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
                <p className="account-settings-label">SMS alerts</p>
                <p className="account-settings-value">
                  {business?.ownerPhone ?? "Add owner cell for lead SMS"}
                </p>
              </div>
              <Link href="/admin" className="btn btn-secondary text-sm">
                Update
              </Link>
            </li>
          </ul>
        </ShellPanel>

        <ShellPanel title="Domain & DNS">
          <p className="font-sans text-sm leading-relaxed text-ash">
            orvius.im · app.orvius.im · api.orvius.im
          </p>
          <Link href="/domains" className="btn btn-secondary mt-4 text-sm">
            Domain guide
          </Link>
        </ShellPanel>
      </div>
    </OsShell>
  );
}
