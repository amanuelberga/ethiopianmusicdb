import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlphaBar, Pager } from "@/components/browse-nav";
import { Names } from "@/components/names";
import { ListSkeleton } from "@/components/page-skeleton";
import { clampPage, getArtistsCount, getArtistsPage } from "@/lib/public-data";

export const metadata: Metadata = { title: "Artists", description: "Browse artists, groups and studios in the Ethiopian Music DB." };
const SIZE = 50;

async function ArtistsContent({ searchParams }: { searchParams: Promise<{ letter?: string; page?: string }> }) {
  const sp = await searchParams;
  const letter = /^[A-Za-z]$/.test(sp.letter ?? "") ? (sp.letter as string).toUpperCase() : undefined;
  const total = await getArtistsCount(letter ?? null);
  const page = clampPage(sp.page, total, SIZE);
  const rows = await getArtistsPage(letter ?? null, page, SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Artists</h1>
      <AlphaBar base="/artists" letter={letter} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No artists found.</p>
      ) : (
        <ul className="columns-1 gap-8 sm:columns-2">
          {rows.map((a) => (
            <li key={a.id} className="break-inside-avoid py-1">
              <Link href={`/artists/${a.id}`} className="hover:underline"><Names en={a.name_en} am={a.name_am} /></Link>
              {a.entity_type !== "Person" && <span className="ml-2 text-xs text-muted-foreground">{a.entity_type}</span>}
            </li>
          ))}
        </ul>
      )}
      <Pager base="/artists" letter={letter} page={page} total={total} size={SIZE} />
    </div>
  );
}

export default function ArtistsPage({ searchParams }: { searchParams: Promise<{ letter?: string; page?: string }> }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ArtistsContent searchParams={searchParams} />
    </Suspense>
  );
}
