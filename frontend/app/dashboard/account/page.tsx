"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { User, Lock, LogOut } from "lucide-react";

/**
 * Account / profile page (C3). Lets a signed-in user update their display name
 * and password, and sign out. Role lives in app_metadata and is intentionally
 * not editable here.
 */
export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setEmail(data.user.email ?? "");
        setFullName(data.user.user_metadata?.full_name ?? "");
      }
      setLoaded(true);
    });
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    setSavingProfile(false);
    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    toast.success("Profile updated.");
    router.refresh();
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      toast.error(`Could not update password: ${error.message}`);
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password updated.");
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Account</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage your profile and password
        </p>
      </div>

      {/* Profile */}
      <form onSubmit={saveProfile} className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
          <User className="w-4 h-4 text-accent" /> Profile
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            disabled
            className="glass-input w-full px-4 py-2.5 text-sm opacity-60 cursor-not-allowed"
          />
          <p className="text-xs text-text-muted mt-1.5">
            Email changes aren&apos;t supported here.
          </p>
        </div>

        <div>
          <label
            htmlFor="account-name"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Full name
          </label>
          <input
            id="account-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="glass-input w-full px-4 py-2.5 text-sm"
            placeholder="Your name"
          />
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="btn-primary flex items-center justify-center gap-2 text-sm"
        >
          {savingProfile && <span className="spinner" />}
          Save profile
        </button>
      </form>

      {/* Password */}
      <form onSubmit={savePassword} className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
          <Lock className="w-4 h-4 text-accent" /> Change password
        </div>

        <div>
          <label
            htmlFor="account-password"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            New password
          </label>
          <input
            id="account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="glass-input w-full px-4 py-2.5 text-sm"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label
            htmlFor="account-confirm"
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            Confirm new password
          </label>
          <input
            id="account-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="glass-input w-full px-4 py-2.5 text-sm"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={savingPassword}
          className="btn-primary flex items-center justify-center gap-2 text-sm"
        >
          {savingPassword && <span className="spinner" />}
          Update password
        </button>
      </form>

      {/* Sign out */}
      <div className="glass-card p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Sign out</p>
          <p className="text-xs text-text-muted mt-0.5">
            End your session on this device.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-danger border border-danger/20 hover:bg-danger/5 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
