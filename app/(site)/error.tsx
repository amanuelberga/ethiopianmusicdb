"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown inside the site layout when a page throws (for example when the database can't be reached).
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 pt-6">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-2xl text-muted-foreground">
        This page could not be loaded. The archive may be briefly unavailable; please try again in a moment.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Error reference: {error.digest}</p>}
      <div className="flex gap-4 text-sm">
        <button onClick={() => retry()} className="rounded bg-primary px-4 py-2 text-primary-foreground">
          Try again
        </button>
        <Link href="/" className="self-center underline">Go to the home page</Link>
      </div>
    </div>
  );
}
