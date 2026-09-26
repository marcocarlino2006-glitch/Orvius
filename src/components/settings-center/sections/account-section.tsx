"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { RecordAvatar } from "@/components/record-avatar";
import type { SettingsSectionId } from "@/lib/settings-center";
import type { buildShopSetupChecklist } from "@/lib/shop-setup-checklist";
import { planDetail, planLabel, type Account, type Business } from "../settings-model";
import { ScGroup, ScRow } from "../settings-primitives";

export function AccountSection({
  account,
  b,
  name,
  email,
  checklist,
  go,
}: {
  account: Account;
  b: Business;
  name: string;
  email: string;
  checklist: ReturnType<typeof buildShopSetupChecklist>;
  go: (next: SettingsSectionId) => void;
}) {
  return (
    <>
      <div className="sc-profile">
        {account.user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sc-profile-avatar" src={account.user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="sc-profile-avatar">
            <RecordAvatar name={name} />
          </span>
        )}
        <div className="sc-profile-copy">
          <p className="sc-profile-name">{name}</p>
          <p className="sc-profile-email">{email}</p>
        </div>
        <button type="button" className="sc-btn" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </button>
      </div>

      <div className="sc-plan">
        <div>
          <p className="sc-plan-kicker">Plan</p>
          <p className="sc-plan-name">{planLabel(account)}</p>
          <p className="sc-plan-detail">{planDetail(account)}</p>
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
    </>
  );
}
