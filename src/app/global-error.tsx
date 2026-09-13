"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0d10",
          color: "#eef1f5",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
            Something broke
          </h1>
          <p style={{ opacity: 0.75, marginBottom: "1.25rem" }}>
            The page hit an unexpected error. Try again — if it keeps happening,
            email hello@orvius.im.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid #eef1f5",
              background: "transparent",
              color: "#eef1f5",
              padding: "0.65rem 1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
