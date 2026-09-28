export const PREVIEW_DRAFT_KEY = "orvius:preview-draft";

export type PreviewDraft = { token: string; shopName: string; ownerPhone: string };

export function readPreviewDraft(): PreviewDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREVIEW_DRAFT_KEY) ?? "null") as PreviewDraft | null;
    return parsed && typeof parsed.token === "string" ? parsed : null;
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
