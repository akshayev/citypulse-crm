import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Logout Server Action — signs out and redirects to login
 */
export async function logout() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
