"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

/**
 * Reset-password page (C1). Landed on from the recovery email. Supabase's
 * browser client (PKCE) exchanges the `code` in the URL for a short-lived
 * recovery session, after which updateUser() can set the new password.
 */
const schema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

type Phase = "verifying" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const supabase = createClient();
    // @supabase/ssr uses PKCE with detectSessionInUrl, so the client itself
    // exchanges the `code` in the URL during init. Calling exchangeCodeForSession
    // again here would race that and consume the one-time verifier, flipping the
    // flow to "invalid" intermittently. Instead we just wait for the recovery
    // session to materialise (same-browser flow; cross-device PKCE links can't
    // be completed here — see the "invalid" fallback).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setPhase("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      setPhase((p) =>
        data.session ? "ready" : p === "verifying" ? "invalid" : p
      );
    });
    return () => subscription.unsubscribe();
  }, []);

  // Redirect shortly after a successful reset (cancellable on unmount).
  useEffect(() => {
    if (phase !== "done") return;
    const id = setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
    return () => clearTimeout(id);
  }, [phase, router]);

  async function onSubmit(data: FormData) {
    setIsLoading(true);
    setServerError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });

    setIsLoading(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    setPhase("done");
  }

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="glass-card p-10 max-w-md w-full animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary">
            Choose a new password
          </h1>
        </div>

        {phase === "verifying" && (
          <div className="flex items-center justify-center gap-2 text-text-secondary text-sm py-6">
            <span className="spinner" /> Verifying your reset link...
          </div>
        )}

        {phase === "invalid" && (
          <div className="space-y-5">
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              This reset link is invalid or has expired. Request a new one.
            </div>
            <Link
              href="/forgot-password"
              className="btn-primary w-full flex items-center justify-center text-sm"
            >
              Request a new link
            </Link>
          </div>
        )}

        {phase === "done" && (
          <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
            Password updated. Redirecting you to your dashboard...
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                {serverError}
              </div>
            )}

            <div>
              <label
                htmlFor="reset-password"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                New password
              </label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
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

            <div>
              <label
                htmlFor="reset-confirm"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Confirm new password
              </label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                className="glass-input w-full px-4 py-2.5 text-sm"
                placeholder="••••••••"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-danger text-xs mt-1.5">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
            >
              {isLoading && <span className="spinner" />}
              {isLoading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
