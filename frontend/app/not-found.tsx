import Link from "next/link";

/**
 * 404 boundary — friendly fallback for unknown routes.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="glass-card p-10 max-w-md w-full text-center animate-fade-in">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Page not found
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link href="/dashboard" className="btn-primary text-sm">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
