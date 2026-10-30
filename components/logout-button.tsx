"use client";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Full page load, not router.push: drops the client router cache of signed-in pages and the
    // hidden, state-preserving copies of earlier pages (e.g. a filled-in login form).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load is intended
    window.location.assign("/auth/login");
  };

  return <button type="button" onClick={logout} className="hover:underline">Log out</button>;
}
