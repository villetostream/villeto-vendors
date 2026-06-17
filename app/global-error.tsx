"use client";

import { useEffect } from "react";

/**
 * Next.js convention: global-error.tsx catches errors thrown in the root
 * layout (app/layout.tsx) itself, which a regular error.tsx boundary can't
 * do since it renders *inside* the layout. Must render its own <html>/<body>
 * since the root layout may not have mounted successfully.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // INTEGRATION POINT: send to an error-tracking service (Sentry, etc.)
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            textAlign: "center",
            padding: "1rem",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", maxWidth: "24rem", marginBottom: "1.5rem" }}>
            Villeto hit an unexpected error. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.75rem",
              backgroundColor: "#111827",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "none",
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
