import type { createClient } from "@/lib/supabase/server";

/** True for signed-in admins and moderators. The database enforces the same rule; this only decides what to show. */
export async function isStaff(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (data as unknown as { role: string } | null)?.role;
  return role === "admin" || role === "moderator";
}
