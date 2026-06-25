"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

/**
 * Login Form Schema (spec: 07-Forms-and-Validation.md)
 * Uses Zod for instant inline validation.
 */
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Show the "confirm your email" hint only when relevant (arrived from signup
  // or hit an unconfirmed-email error) — not on every visit.
  const [showConfirmHint, setShowConfirmHint] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    // Read the query param client-side to avoid a useSearchParams Suspense
    // boundary on this statically-rendered page. Deferred via a timer so the
    // setState isn't synchronous in the effect (react-hooks/set-state-in-effect).
    const wantsConfirm =
      new URLSearchParams(window.location.search).get("confirm") === "1";
    if (!wantsConfirm) return;
    const id = setTimeout(() => setShowConfirmHint(true), 0);
    return () => clearTimeout(id);
  }, []);

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true);
    setServerError(null);
    setResendMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setServerError(error.message);
      // Supabase returns "Email not confirmed" — offer a resend in that case.
      if (/confirm/i.test(error.message)) {
        setUnconfirmedEmail(data.email);
        setShowConfirmHint(true);
      }
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResend() {
    if (!unconfirmedEmail) return;
    setResendMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: unconfirmedEmail,
    });
    setResendMsg(
      error
        ? `Could not resend: ${error.message}`
        : "Confirmation email sent — check your inbox."
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="glass-card p-10 max-w-md w-full animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-light mb-3">
            <svg
              className="w-6 h-6 text-white"
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
          <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
          <p className="text-text-secondary text-sm mt-1">
            Sign in to your CityPulse CRM
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {showConfirmHint && (
            <div className="p-3 rounded-lg bg-info/10 border border-info/20 text-info text-sm space-y-2">
              <p>Confirm your email first, then sign in.</p>
              {unconfirmedEmail && (
                <button
                  type="button"
                  onClick={handleResend}
                  className="underline hover:no-underline font-medium"
                >
                  Resend confirmation email
                </button>
              )}
              {resendMsg && <p className="text-text-secondary">{resendMsg}</p>}
            </div>
          )}

          {serverError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {serverError}
            </div>
          )}

          {/* Email Field */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="glass-input w-full px-4 py-2.5 text-sm"
              placeholder="you@company.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-danger text-xs mt-1.5">{errors.email.message}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-text-secondary"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-accent hover:text-accent-light transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="glass-input w-full px-4 py-2.5 text-sm"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-danger text-xs mt-1.5">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            {isLoading && <span className="spinner" />}
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-text-muted text-sm mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-accent hover:text-accent-light transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
