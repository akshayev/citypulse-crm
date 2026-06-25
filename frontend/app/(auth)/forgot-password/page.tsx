"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

/**
 * Forgot-password page (C1). Sends a Supabase recovery email that links back
 * to /reset-password. We always show a success state (even for unknown emails)
 * so the form can't be used to enumerate accounts.
 */
const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setIsLoading(true);
    setServerError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setIsLoading(false);
    // Don't leak whether the email exists — show the same success either way.
    if (error && !/rate|limit/i.test(error.message)) {
      setSent(true);
      return;
    }
    if (error) {
      setServerError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="glass-card p-10 max-w-md w-full animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary">
            Reset your password
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            We&apos;ll email you a secure link to set a new one.
          </p>
        </div>

        {sent ? (
          <div className="space-y-5">
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
              If an account exists for that email, a reset link is on its way.
              Check your inbox (and spam).
            </div>
            <Link
              href="/login"
              className="btn-primary w-full flex items-center justify-center text-sm"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                {serverError}
              </div>
            )}

            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                className="glass-input w-full px-4 py-2.5 text-sm"
                placeholder="you@company.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-danger text-xs mt-1.5">
                  {errors.email.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
            >
              {isLoading && <span className="spinner" />}
              {isLoading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-center text-text-muted text-sm mt-6">
          Remembered it?{" "}
          <Link
            href="/login"
            className="text-accent hover:text-accent-light transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
