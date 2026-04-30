import Link from "next/link";

/**
 * CityPulse CRM — Landing / Redirect Page
 */
export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="glass-card p-12 max-w-lg w-full text-center animate-fade-in">
        {/* Logo */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-light mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">
            CityPulse
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            AI-Powered CRM for Smart Lead Management
          </p>
        </div>

        {/* Description */}
        <p className="text-text-secondary text-sm leading-relaxed mb-8">
          Automate lead generation, score prospects with Gemini AI, and manage
          your sales pipeline in real-time with our drag-and-drop Kanban board.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="btn-primary text-center text-sm no-underline"
          >
            Sign In to Dashboard
          </Link>
          <Link
            href="/signup"
            className="btn-ghost text-center text-sm no-underline"
          >
            Create Account
          </Link>
        </div>

        {/* Footer */}
        <p className="text-text-muted text-xs mt-8">
          Zero-cost • Event-driven • AI-powered
        </p>
      </div>
    </main>
  );
}
