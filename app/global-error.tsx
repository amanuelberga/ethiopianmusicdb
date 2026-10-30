"use client";

import "./globals.css";

// Replaces the root layout when it fails, so it brings its own <html>, <body> and styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <title>Something went wrong · Ethiopian Music DB</title>
        <main className="mx-auto flex max-w-5xl flex-col items-start gap-3 p-5 pt-12">
          <p className="font-semibold">Ethiopian Music DB</p>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="max-w-2xl text-muted-foreground">The site could not be loaded. Please try again in a moment.</p>
          {error.digest && <p className="text-xs text-muted-foreground">Error reference: {error.digest}</p>}
          <div className="flex gap-4 text-sm">
            <button onClick={() => retry()} className="rounded bg-primary px-4 py-2 text-primary-foreground">
              Try again
            </button>
            {/* A plain <a> so the whole document reloads */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="self-center underline">Go to the home page</a>
          </div>
        </main>
      </body>
    </html>
  );
}
