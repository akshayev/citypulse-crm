"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches uncaught render/runtime errors in any route
 * segment so a single component failure can't white-screen the whole app.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with Sentry capture in Phase B3.
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="glass-card p-10 max-w-md w-full text-center animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          An unexpected error occurred. You can try again or head back to the
          dashboard.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => reset()} className="btn-primary text-sm">
            Try again
          </button>
          <a href="/dashboard" className="btn-ghost text-sm">
            Go to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
