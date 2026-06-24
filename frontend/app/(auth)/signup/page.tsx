"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

/**
 * Signup Form Schema (spec: 07-Forms-and-Validation.md)
 */
const signupSchema = z
  .object({
    fullName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupFormData) {
    setIsLoading(true);
    setServerError(null);

    const supabase = createClient();
    const { data: signupData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          // Only non-privileged profile data here. The role lives in
          // app_metadata (set server-side by a DB trigger), because
          // user_metadata is editable by the user and must NOT be trusted
          // for authorization.
          full_name: data.fullName,
        },
      },
    });

    if (error) {
      setServerError(error.message);
      setIsLoading(false);
      return;
    }

    if (!signupData.session) {
      setServerError(
        "Account created. Please confirm your email, then sign in."
      );
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
          <h1 className="text-2xl font-bold text-text-primary">
            Create Account
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Join the CityPulse CRM platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {serverError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {serverError}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label
              htmlFor="signup-name"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Full Name
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              className="glass-input w-full px-4 py-2.5 text-sm"
              placeholder="John Doe"
              {...register("fullName")}
            />
            {errors.fullName && (
              <p className="text-danger text-xs mt-1.5">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Email
            </label>
            <input
              id="signup-email"
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

          {/* Password */}
          <div>
            <label
              htmlFor="signup-password"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Password
            </label>
            <input
              id="signup-password"
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

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="signup-confirm"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Confirm Password
            </label>
            <input
              id="signup-confirm"
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

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            {isLoading && <span className="spinner" />}
            {isLoading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-text-muted text-sm mt-6">
          Already have an account?{" "}
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
