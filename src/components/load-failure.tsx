"use client";

/** The message a page throws on a 401, so the failure state offers sign-in instead of a Retry that can't work. */
export const SESSION_EXPIRED = "Your session expired. Sign in again.";

/** Sign in, then come back to this exact page. The sign-in page only follows same-site paths. */
export function signInAgain() {
  const back = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/signin?callbackUrl=${encodeURIComponent(back)}`;
}

/** A page's data didn't load: what failed, and the one action that can fix it. */
export function LoadFailure({ title, error, onRetry }: { title: string; error: string; onRetry: () => void }) {
  const signedOut = error === SESSION_EXPIRED;
  return (
    <div className="ox-state ox-state--failure ox-state--inline" role="alert">
      <p className="ox-state-title">{title}</p>
      <p className="ox-state-copy">{error}</p>
      {signedOut ? (
        <button type="button" className="ox-btn ox-btn--primary ox-btn--sm" onClick={signInAgain}>
          Sign in
        </button>
      ) : (
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
