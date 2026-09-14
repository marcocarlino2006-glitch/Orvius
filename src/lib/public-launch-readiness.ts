import { getAuthConfigStatus } from "@/lib/auth-env";
import { getBillingReadiness } from "@/lib/billing-readiness";
import { company } from "@/lib/company";
import { isEmailConfigured } from "@/lib/email";
import { getConfigStatus, isConfigured } from "@/lib/env";
import { isSelfServeSignupEnabled } from "@/lib/self-serve-signup";
import { canProvisionDedicatedLine } from "@/lib/twilio-phone";

export type PublicLaunchRequirements = {
  selfServeEnabled: boolean;
  authReady: boolean;
  billingReady: boolean;
  telephonyReady: boolean;
  lineProvisioningReady: boolean;
  voiceWebhookReady: boolean;
  emailReady: boolean;
  legalReady: boolean;
};

export function arePublicLaunchRequirementsMet(
  requirements: PublicLaunchRequirements,
) {
  return Object.values(requirements).every(Boolean);
}

/** Public-safe launch truth. It exposes booleans, never secret names or values. */
export function getPublicLaunchReadiness() {
  const requirements: PublicLaunchRequirements = {
    selfServeEnabled: isSelfServeSignupEnabled(),
    authReady: getAuthConfigStatus().ready,
    billingReady: getBillingReadiness().fullyReady,
    telephonyReady: getConfigStatus().ready,
    lineProvisioningReady: canProvisionDedicatedLine(),
    voiceWebhookReady: isConfigured("VAPI_WEBHOOK_SECRET"),
    emailReady: isEmailConfigured(),
    legalReady: Boolean(company.formationStateConfirmed?.trim()),
  };

  return {
    ready: arePublicLaunchRequirementsMet(requirements),
    requirements,
  };
}
