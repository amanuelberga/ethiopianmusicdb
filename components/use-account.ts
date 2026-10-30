"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Account = { signedIn: false } | { signedIn: true; staff: boolean };

// One role lookup per signed-in user per page load, shared by every component that asks
let current: { userId: string | null; account: Promise<Account> } | null = null;

function accountFor(userId: string | null): Promise<Account> {
  if (current?.userId === userId) return current.account;
  const account: Promise<Account> = !userId ? Promise.resolve({ signedIn: false }) : (async () => {
    const supabase = createClient();
    // A local session can outlive one ended elsewhere (signed out on another device, or revoked). Only an
    // answer from Supabase Auth ends it here; a network error keeps the local session.
    const { data: { user }, error } = await supabase.auth.getUser();
    const status = (error as { status?: number } | null)?.status;
    if (!user && (status === 401 || status === 403)) {
      await supabase.auth.signOut({ scope: "local" }); // clears the dead cookie, so the proxy agrees
      return { signedIn: false };
    }
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    const role = (data as { role: string } | null)?.role;
    return { signedIn: true, staff: role === "admin" || role === "moderator" };
  })();
  current = { userId, account };
  return account;
}

/**
 * The visitor's account, read in the browser so pages can be cached and served the same to everyone.
 * null until known. Display only: the proxy and the database rules do the real checks.
 */
export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const show = (userId: string | null) => accountFor(userId).then((a) => active && setAccount(a));

    // INITIAL_SESSION fires straight away; later events cover a sign-out in another tab or a failed token
    // refresh. Deferred, because Supabase calls must not run inside this callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void show(session?.user.id ?? null), 0);
    });
    // A page restored from the back/forward cache keeps its old state, so read the session again
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void supabase.auth.getSession().then(({ data }) => show(data.session?.user.id ?? null));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return account;
}

/** Renders its children only for signed-in staff (admins and moderators), once the role is known. */
export function StaffOnly({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  return account?.signedIn && account.staff ? children : null;
}
