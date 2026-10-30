import type { Metadata } from "next";
import { Suspense } from "react";
import { AlphaBar, Pager } from "@/components/browse-nav";
import { ListSkeleton } from "@/components/page-skeleton";
import { ReleaseGrid } from "@/components/release-grid";
import { clampPage, getReleasesCount, getReleasesPage } from "@/lib/public-data";

export const metadata: Metadata = { title: "Releases", description: "Browse albums, singles and compilations in the Ethiopian Music DB." };
const SIZE = 24;

async function ReleasesContent({ searchParams }: { searchParams: Promise<{ letter?: string; page?: string }> }) {
  const sp = await searchParams;
  const letter = /^[A-Za-z]$/.test(sp.letter ?? "") ? (sp.letter as string).toUpperCase() : undefined;
  const total = await getReleasesCount(letter ?? null);
  const page = clampPage(sp.page, total, SIZE);
  const rows = await getReleasesPage(letter ?? null, page, SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Releases</h1>
      <AlphaBar base="/releases" letter={letter} />
      <ReleaseGrid items={rows} />
      <Pager base="/releases" letter={letter} page={page} total={total} size={SIZE} />
    </div>
  );
}

export default function ReleasesPage({ searchParams }: { searchParams: Promise<{ letter?: string; page?: string }> }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ReleasesContent searchParams={searchParams} />
    </Suspense>
  );
}
