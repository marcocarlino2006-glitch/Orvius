import { isTrade, type Trade } from "@/lib/trades";

export const PREVIEW_DRAFT_KEY = "orvius:preview-draft";

export type PreviewDraft = { token: string; shopName: string; ownerPhone: string; trade?: Trade };

export function readPreviewDraft(): PreviewDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREVIEW_DRAFT_KEY) ?? "null") as PreviewDraft | null;
    if (!parsed || typeof parsed.token !== "string") return null;
    return { ...parsed, trade: isTrade(parsed.trade) ? parsed.trade : undefined };
  } catch {
    return null;
  }
}

export function savePreviewDraft(draft: PreviewDraft) {
  try {
    window.localStorage.setItem(PREVIEW_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Private mode: the preview still works, onboarding just starts blank. */
  }
}
