import Link from "next/link";

// Shared by app/not-found.tsx (unmatched URLs, outside the site layout) and app/(site)/not-found.tsx (notFound()
// called by a page that already sits inside the site layout).
export function NotFoundContent() {
  return (
    <div className="flex flex-col items-start gap-3 pt-6">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-2xl text-muted-foreground">
        There is no page at this address. The record may have been merged, deleted or never existed.
      </p>
      <div className="flex gap-4 text-sm">
        <Link href="/search" className="underline">Search the archive</Link>
        <Link href="/releases" className="underline">Browse releases</Link>
        <Link href="/artists" className="underline">Browse artists</Link>
      </div>
    </div>
  );
}
