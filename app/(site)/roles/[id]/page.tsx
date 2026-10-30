import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getRecentIds, getRoleMeta } from "@/lib/public-data";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Names } from "@/components/names";
import { ListSkeleton } from "@/components/page-skeleton";
import { recordTag, ROLES_TAG, tagList, UUID_RE } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import type { ArtistRef } from "@/lib/types";

// Cached for everyone (no cookies), tagged with this role and the artists it lists; lib/refresh.ts expires the
// tags after a save. A failed read throws, so it is never cached.
async function getRolePage(id: string) {
  "use cache";
  cacheLife("hours"); // edits made in the app clear it at once (lib/refresh.ts)
  if (!UUID_RE.test(id)) return null;
  const supabase = createPublicClient();
  const [role, rc, tc] = await Promise.all([
    supabase.from("credit_roles").select("id,role_en,role_am,is_custom").eq("id", id).maybeSingle(),
    // credits on main releases only, so an edition's copy of the same credits is not counted twice
    supabase.from("release_credits").select("artists(id,name_en,name_am), releases!inner(edition_of)")
      .eq("role_id", id).is("releases.edition_of", null).limit(1000),
    supabase.from("track_credits").select("artists(id,name_en,name_am), tracks!inner(releases!inner(edition_of))")
      .eq("role_id", id).is("tracks.releases.edition_of", null).limit(2000),
  ]);
  if (role.error || rc.error || tc.error) throw new Error("Database read failed");
  const rows = [...(rc.data ?? []), ...(tc.data ?? [])] as unknown as { artists: ArtistRef }[];
  // ROLES_TAG: every release save clears all role pages, since a removed credit can't be traced back to its role
  cacheTag(...tagList(recordTag("role", id), [ROLES_TAG, ...rows.map((x) => recordTag("artist", x.artists.id))]));
  if (!role.data) return null;
  return { r: role.data as unknown as { id: string; role_en: string; role_am: string | null; is_custom: boolean }, rows };
}

async function RoleContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getRolePage(id);
  if (!page) notFound();
  const { r, rows } = page;

  const counts = new Map<string, { artist: ArtistRef; n: number }>();
  for (const row of rows) {
    const e = counts.get(row.artists.id);
    if (e) e.n += 1;
    else counts.set(row.artists.id, { artist: row.artists, n: 1 });
  }
  const list = [...counts.values()].sort((a, b) => b.n - a.n || a.artist.name_en.localeCompare(b.artist.name_en));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit role{r.is_custom ? " · custom, pending review" : ""}</p>
        <h1 className="text-3xl font-bold"><Names en={r.role_en} am={r.role_am} /></h1>
      </header>
      <section>
        <h2 className="dg-h">Credited artists ({list.length})</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credits with this role yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {list.map(({ artist, n }) => (
              <li key={artist.id} className="flex justify-between py-2">
                <Link href={`/artists/${artist.id}`} className="hover:underline"><Names en={artist.name_en} am={artist.name_am} /></Link>
                <span className="text-muted-foreground">{n} credit{n > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// The newest roles are prerendered at build; any other role is rendered on its first visit and cached.
export async function generateStaticParams() {
  return getRecentIds("credit_roles");
}

export default function RolePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <RoleContent params={params} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await getRoleMeta(id);
  if (!r) return { title: "Credit role not found" };
  return {
    title: r.role_am ? `${r.role_en} / ${r.role_am}` : r.role_en,
    description: `Artists credited as ${r.role_en} on Ethiopian Music DB.`,
    alternates: { canonical: `/roles/${id}` },
  };
}
