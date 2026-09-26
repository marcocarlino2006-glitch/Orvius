"use client";

import { FounderManusNext } from "@/components/founder-manus-next";
import type { ManusPostStep } from "@/lib/manus-post";
import { FOUNDER_CERT, type Account } from "../settings-model";
import { ScGroup, ScRow, ScSwitch } from "../settings-primitives";

export function InternalSection({
  account,
  certChecks,
  toggleCert,
  manusNext,
}: {
  account: Account;
  certChecks: boolean[];
  toggleCert: (index: number) => Promise<void>;
  manusNext: ManusPostStep | null;
}) {
  const certDone = certChecks.filter(Boolean).length;
  if (!account.founder) return null;
  return (
    <>
      <ScGroup title={`Founder phone certification · ${certDone} of ${FOUNDER_CERT.length}`}>
        {FOUNDER_CERT.map((label, index) => (
          <ScRow key={label} label={label}>
            <ScSwitch
              label={label}
              checked={certChecks[index] ?? false}
              onChange={() => void toggleCert(index)}
            />
          </ScRow>
        ))}
      </ScGroup>
      <ScGroup title="Launch checklist · next">
        <div className="sc-embed sc-pad">
          <FounderManusNext tone="quiet" next={manusNext} />
        </div>
      </ScGroup>
      {!account.alerts.emailConfigured ? (
        <ScGroup title="Email failover">
          <ScRow
            id="email-failover"
            label="Resend is not configured"
            hint="Add RESEND_API_KEY and RESEND_FROM on Vercel, redeploy, then send a test alert. Owners never see this."
          />
        </ScGroup>
      ) : null}
    </>
  );
}
