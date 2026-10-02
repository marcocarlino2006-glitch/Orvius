/* Shared with the settings screen, so no server imports here. */

export const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Corporation",
  "Corporation",
  "Co-operative",
  "Non-profit Corporation",
] as const;

export type TextingDetails = {
  legalName: string;
  businessType: (typeof BUSINESS_TYPES)[number];
  ein: string;
  website: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  repFirstName: string;
  repLastName: string;
  repEmail: string;
  repPhone: string;
  repTitle: string;
};

export type TextingStatus = "submitted" | "profile_review" | "brand_review" | "campaign_review" | "approved" | "failed";

/** What the owner sees for each state. Reviews are the carriers', not ours, so no promised dates. */
export const TEXTING_STATUS_COPY: Record<TextingStatus, string> = {
  submitted: "Received. Orvius is sending your details to the carriers.",
  profile_review: "The carriers are checking your business details.",
  brand_review: "Your business is approved; the carriers are registering it for texting.",
  campaign_review: "Last step: the carriers are approving what your shop texts. This one usually takes the longest.",
  approved: "Your texts come from your own number.",
  failed: "The carriers turned it down. Fix the details below and send again.",
};
