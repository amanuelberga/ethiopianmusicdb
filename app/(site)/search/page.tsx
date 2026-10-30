import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/page-skeleton";
import { createPublicClient } from "@/lib/supabase/public";
import { hitHref, type Hit } from "@/lib/types";

export const metadata: Metadata = { title: "Search", description: "Search Ethiopian artists, releases, tracks and credit roles.", robots: { index: false } };

const GROUPS: [string, string][] = [
  ["artist", "Artists"], ["release", "Releases"], ["track", "Tracks"], ["label", "Labels"], ["role", "Credit roles"],
];

async function SearchContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const supabase = createPublicClient();
  const { data } = term.length >= 2 ? await supabase.rpc("search_all", { q: term, max_results: 60 }) : { data: [] };
  const hits = (data ?? []) as unknown as Hit[];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Results for “{term}”</h1>
      {hits.length === 0 && <p className="text-muted-foreground">No matches.</p>}
      {GROUPS.map(([key, title]) => {
        const rows = hits.filter((h) => h.entity === key);
        if (!rows.length) return null;
        return (
          <section key={key}>
            <h2 className="dg-h">{title}</h2>
            <ul className="divide-y">
              {rows.map((h) => {
                const href = hitHref(h);
                return (
                  <li key={h.entity_id} className="py-2 text-sm">
                    {href ? <Link href={href} className="hover:underline">{h.label}</Link> : h.label}
                    {h.sublabel && <span className="ml-2 text-muted-foreground">{h.sublabel}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchContent searchParams={searchParams} />
    </Suspense>
  );
}
