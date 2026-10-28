"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "next-auth/react";
import { RecordAvatar } from "@/components/record-avatar";
import type { SettingsSectionId } from "@/lib/settings-center";
import type { buildShopSetupChecklist } from "@/lib/shop-setup-checklist";
import { planDetail, planLabel, type Account, type Business } from "../settings-model";
import { AppearanceGroup } from "../appearance-group";
import { ReferGroup } from "../refer-group";
import { SecurityGroup } from "../security-group";
import { ScGroup, ScRow } from "../settings-primitives";
import { SettingsIcon } from "../settings-icons";

export function AccountSection({
  account,
  b,
  name,
  email,
  checklist,
  go,
  more,
}: {
  account: Account;
  b: Business;
  name: string;
  email: string;
  checklist: ReturnType<typeof buildShopSetupChecklist>;
  go: (next: SettingsSectionId) => void;
  more?: ReactNode;
}) {
  return (
    <>
      <div className="sc-profile">
        {account.user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sc-profile-avatar" src={account.user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="sc-profile-avatar">
            <RecordAvatar name={account.user?.name} email={email} />
          </span>
        )}
        <div className="sc-profile-copy">
          <p className="sc-profile-name">{name}</p>
          <p className="sc-profile-email">{email}</p>
        </div>
      </div>

      <div className="sc-plan">
        <div>
          <p className="sc-plan-kicker">Plan</p>
          <p className="sc-plan-name">{planLabel(account)}</p>
          <p className="sc-plan-detail">{planDetail(account)}</p>
          {account.billing?.usage ? (
            <>
              <div className="sc-meter" aria-hidden>
                <span
                  style={{
                    width: `${Math.min(100, Math.round((account.billing.usage.used / Math.max(1, account.billing.usage.included)) * 100))}%`,
                  }}
                />
              </div>
              <p className="sc-plan-detail">
                {account.billing.usage.used.toLocaleString("en-US")} of {account.billing.usage.included.toLocaleString("en-US")} included
                calls this month.
              </p>
            </>
          ) : null}
        </div>
        <button type="button" className="sc-btn sc-btn--primary" onClick={() => go("billing")}>
          {account.billing?.status === "active" ? "Manage" : "Upgrade"}
        </button>
      </div>

      {checklist.next ? (
        <div className="sc-plan sc-plan--setup">
          <div className="sc-setup-copy">
            <p className="sc-plan-kicker">
              Setup · {checklist.doneCount} of {checklist.totalCount}
            </p>
            <p className="sc-plan-name">{checklist.next.label}</p>
            <p className="sc-plan-detail">{checklist.next.detail}</p>
            <div className="sc-meter" aria-hidden>
              <span style={{ width: `${Math.round(checklist.progress * 100)}%` }} />
            </div>
          </div>
          <Link href={checklist.next.href} className="sc-btn">
            Continue
          </Link>
        </div>
      ) : null}

      {more}

      <ScGroup title="Workspace">
        <ScRow label="Shop" hint={[b.trade, b.address].filter(Boolean).join(" · ") || undefined}>
          <span className="sc-value">{b.name}</span>
        </ScRow>
        <ScRow label="Role">
          <span className="sc-value">
            {email && b.ownerEmail && email.toLowerCase() === b.ownerEmail.toLowerCase() ? "Owner" : "Member"}
          </span>
        </ScRow>
        {b.createdAt ? (
          <ScRow label="Member since">
            <span className="sc-value">
              {new Date(b.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </ScRow>
        ) : null}
      </ScGroup>

      <SecurityGroup />

      {email && b.ownerEmail && email.toLowerCase() === b.ownerEmail.toLowerCase() ? <ReferGroup /> : null}

      <AppearanceGroup />

      <div className="sc-end" aria-label="Sign out and delete">
        <button type="button" className="sc-end-row" onClick={() => signOut({ callbackUrl: "/" })}>
          <span className="sc-row-lead">
            <SettingsIcon name="signout" />
          </span>
          Sign out
        </button>
        <button type="button" className="sc-end-row sc-end-row--danger" onClick={() => go("data")}>
          <span className="sc-row-lead">
            <SettingsIcon name="data" />
          </span>
          <span className="sc-row-copy">
            <span className="sc-row-label">Delete workspace</span>
            <span className="sc-row-hint">Your shop, calls and records, permanently</span>
          </span>
        </button>
      </div>
    </>
  );
}
