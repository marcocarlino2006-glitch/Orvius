"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { company } from "@/lib/company";

/*
  The last resort: the root layout itself failed, so there is no app shell to
  render into and none of the stylesheets are guaranteed to have loaded. Next
  requires this file to supply its own <html> and <body>.

  Everything here is inline-styled for that reason. A global error page that
  depends on globals.css is a global error page that renders as unstyled black
  text on white when the failure is the stylesheet.
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /*
    The server never saw a render it could log, so without this the only trace
    of a total failure is in one owner's browser console — which is to say
    nowhere. The DSN check keeps local and preview builds from reporting.
  */
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17150f",
          color: "#e9e9e9",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "30rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.625rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#a09f9e",
            }}
          >
            {company.productName}
          </p>
          <h1 style={{ margin: "0.5rem 0 0", fontSize: "1.25rem", lineHeight: 1.3 }}>
            Something broke on our side
          </h1>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", lineHeight: 1.6, color: "#c9c8c6" }}>
            Your shop line is unaffected — calls are still being answered and
            your alerts are still being sent. This is the web app only.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: "1px solid #d9784b",
                background: "#d9784b",
                color: "#17150f",
                borderRadius: "0.25rem",
                padding: "0.5rem 0.875rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href={`mailto:${company.supportEmail}?subject=${encodeURIComponent(
                `${company.productName}: app failed to load`,
              )}${error.digest ? `&body=${encodeURIComponent(`\n\nReference: ${error.digest}`)}` : ""}`}
              style={{
                border: "1px solid #4b4945",
                color: "#e9e9e9",
                borderRadius: "0.25rem",
                padding: "0.5rem 0.875rem",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Email support
            </a>
          </div>
          <p style={{ margin: "1rem 0 0", fontSize: "0.75rem", color: "#a09f9e" }}>
            {company.supportEmail}
            {error.digest ? ` · reference ${error.digest}` : ""}
          </p>
        </main>
      </body>
    </html>
  );
}
