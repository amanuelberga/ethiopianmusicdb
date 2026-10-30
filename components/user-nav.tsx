"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useAccount } from "@/components/use-account";

// Checked in the browser, so the shared header never reads cookies on the server and public pages can be
// served from the cache. Until the session (and, when signed in, the role) is known, the space stays empty so
// the header doesn't jump; both states keep the placeholder's height (h-9) for the same reason.
export function UserNav() {
  const account = useAccount();

  if (!account) return <div aria-hidden="true" className="h-9 min-w-[9.5rem]" />;

  if (!account.signedIn) {
    return (
      <div className="flex h-9 items-center gap-3 whitespace-nowrap">
        <Link href="/auth/login" className="hover:underline">Sign in</Link>
        <Link href="/auth/sign-up" className="rounded bg-[hsl(var(--header-fg))] px-3 py-1.5 font-semibold text-[hsl(var(--header-bg))] hover:opacity-90">Sign up</Link>
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center gap-3 whitespace-nowrap">
      {account.staff && <Link href="/moderation" prefetch={false} className="hover:underline">Moderation</Link>}
      <Link href="/dashboard" prefetch={false} className="font-medium hover:underline">Dashboard</Link>
      <LogoutButton />
    </div>
  );
}
