import { cacheLife, cacheTag } from "next/cache";
import { GRID_SELECT, type GridRelease } from "@/components/release-grid";
import { ALL_TAG, LISTS_TAG, recordTag, tagList, UUID_RE } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import type { ArtistRef } from "@/lib/types";

// Cached public reads, tagged so lib/refresh.ts can expire them right after a save (see lib/cache-tags.ts).
// The detail pages' own cached reads live in their page files.
// A failed query throws, so the failure is never cached as an empty result.
// Lists and counts show main releases only: an edition (edition_of set) appears on its main release's page.

function ok<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(`Database read failed: ${res.error.message}`);
  return res;
}

export async function getHomeData() {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTS_TAG, ALL_TAG);
  const db = createPublicClient();
  const [releases, artists, rc, ac, tc] = await Promise.all([
    db.from("releases").select(GRID_SELECT).is("edition_of", null).order("created_at", { ascending: false }).limit(12),
    db.from("artists").select("id,name_en,name_am").is("merged_into", null).order("created_at", { ascending: false }).limit(12),
    db.from("releases").select("*", { count: "exact", head: true }).is("edition_of", null),
    db.from("artists").select("*", { count: "exact", head: true }).is("merged_into", null),
    db.from("tracks").select("id,releases!inner(edition_of)", { count: "exact", head: true }).is("releases.edition_of", null),
  ]);
  [releases, artists, rc, ac, tc].forEach(ok);
  return {
    releases: (releases.data ?? []) as unknown as GridRelease[],
    artists: (artists.data ?? []) as unknown as ArtistRef[],
    counts: { releases: rc.count ?? 0, artists: ac.count ?? 0, tracks: tc.count ?? 0 },
  };
}

// Cached for about a minute, so the homepage can be served from the cache; Shuffle on the page samples
// again in the browser. Ids are random UUIDs, so a slice in id order from a random offset is a random sample.
export async function getRandomReleases(total: number, n: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTS_TAG, ALL_TAG);
  const offset = Math.floor(Math.random() * Math.max(1, total - n + 1));
  const { data } = ok(await createPublicClient().from("releases").select(GRID_SELECT).is("edition_of", null).order("id").range(offset, offset + n - 1));
  return (data ?? []) as unknown as GridRelease[];
}

// Browse lists: the count (one cache entry per letter) comes first, so the page number can be clamped to a real
// page before the page itself is read; any other ?page= value never creates a cache entry of its own.
export async function getArtistsCount(letter: string | null) {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTS_TAG, ALL_TAG);
  let q = createPublicClient().from("artists").select("*", { count: "exact", head: true }).is("merged_into", null);
  if (letter) q = q.ilike("name_en", `${letter}%`);
  return ok(await q).count ?? 0;
}

export async function getArtistsPage(letter: string | null, page: number, size: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTS_TAG, ALL_TAG);
  let q = createPublicClient().from("artists").select("id,name_en,name_am,entity_type")
    .is("merged_into", null).order("name_en").range((page - 1) * size, page * size - 1);
  if (letter) q = q.ilike("name_en", `${letter}%`);
  const { data } = ok(await q);
  return (data ?? []) as unknown as { id: string; name_en: string; name_am: string | null; entity_type: string }[];
}

export async function getReleasesCount(letter: string | null) {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTS_TAG, ALL_TAG);
  let q = createPublicClient().from("releases").select("*", { count: "exact", head: true }).is("edition_of", null);
  if (letter) q = q.ilike("title_en", `${letter}%`);
  return ok(await q).count ?? 0;
}

export async function getReleasesPage(letter: string | null, page: number, size: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTS_TAG, ALL_TAG);
  let q = createPublicClient().from("releases").select(GRID_SELECT)
    .is("edition_of", null).order("title_en").range((page - 1) * size, page * size - 1);
  if (letter) q = q.ilike("title_en", `${letter}%`);
  const { data } = ok(await q);
  return (data ?? []) as unknown as GridRelease[];
}

/** ?page= as a whole number between 1 and the last page (1 when the list is empty). */
export function clampPage(raw: string | undefined, total: number, size: number) {
  const last = Math.max(1, Math.ceil(total / size));
  return Math.min(last, Math.max(1, Math.floor(Number(raw)) || 1));
}

export async function getReleaseMeta(id: string) {
  "use cache";
  cacheLife("hours");
  if (!UUID_RE.test(id)) return null;
  const { data } = ok(await createPublicClient().from("releases")
    .select("title_en,release_year,cover_key,youtube_video_id,edition_of,release_artists(position,artists(id,name_en))").eq("id", id).maybeSingle());
  const r = (data ?? null) as unknown as {
    title_en: string; release_year: number | null; cover_key: string | null; youtube_video_id: string | null;
    edition_of: string | null;
    release_artists: { position: number; artists: { id: string; name_en: string } }[];
  } | null;
  // the title names the artists, so a renamed artist clears it too
  cacheTag(...tagList(recordTag("release", id), (r?.release_artists ?? []).map((x) => recordTag("artist", x.artists.id))));
  return r;
}

export async function getArtistMeta(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(recordTag("artist", id), ALL_TAG);
  if (!UUID_RE.test(id)) return null;
  const { data } = ok(await createPublicClient().from("artists").select("name_en,name_am,bio_en").eq("id", id).maybeSingle());
  return (data ?? null) as unknown as { name_en: string; name_am: string | null; bio_en: string | null } | null;
}

export async function getLabelMeta(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(recordTag("label", id), ALL_TAG);
  if (!UUID_RE.test(id)) return null;
  const { data } = ok(await createPublicClient().from("labels").select("name_en,name_am").eq("id", id).maybeSingle());
  return (data ?? null) as unknown as { name_en: string; name_am: string | null } | null;
}

export async function getRoleMeta(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(recordTag("role", id), ALL_TAG);
  if (!UUID_RE.test(id)) return null;
  const { data } = ok(await createPublicClient().from("credit_roles").select("role_en,role_am").eq("id", id).maybeSingle());
  return (data ?? null) as unknown as { role_en: string; role_am: string | null } | null;
}

// Sitemaps: one file per 50,000 URLs (Google's limit) of each table, read in pages because
// PostgREST returns at most 1,000 rows per request. Editions are left out (their canonical URL is the main release).
export const SITEMAP_TABLES = ["releases", "artists", "labels"] as const;
export type SitemapTable = (typeof SITEMAP_TABLES)[number];
export const SITEMAP_SIZE = 50000;

function sitemapQuery(table: SitemapTable, select: string, options?: { count: "exact"; head: true }) {
  const q = createPublicClient().from(table).select(select, options);
  if (table === "artists") return q.is("merged_into", null);
  if (table === "releases") return q.is("edition_of", null);
  return q;
}

export async function getSitemapCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag(ALL_TAG);
  const res = await Promise.all(SITEMAP_TABLES.map((t) => sitemapQuery(t, "*", { count: "exact", head: true })));
  res.forEach(ok);
  return Object.fromEntries(SITEMAP_TABLES.map((t, i) => [t, res[i].count ?? 0])) as Record<SitemapTable, number>;
}

export async function getSitemapRows(table: SitemapTable, start: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(ALL_TAG);
  type Row = { id: string; updated_at: string };
  const rows: Row[] = [];
  const end = start + SITEMAP_SIZE;
  for (let from = start; from < end; ) {
    const { data } = ok(await sitemapQuery(table, "id,updated_at").order("id").range(from, Math.min(from + 999, end - 1)));
    const page = (data ?? []) as unknown as Row[];
    if (!page.length) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

// generateStaticParams for the detail pages: the newest records are prerendered at build; any other page is
// rendered on its first visit and cached from then on. Cache Components needs at least one id per route.
export async function getRecentIds(table: "releases" | "artists" | "labels" | "credit_roles", n = 20) {
  let q = createPublicClient().from(table).select("id").order("created_at", { ascending: false }).limit(n);
  if (table === "releases") q = q.is("edition_of", null);
  if (table === "artists") q = q.is("merged_into", null);
  const { data } = ok(await q);
  return ((data ?? []) as { id: string }[]).map((r) => ({ id: r.id }));
}
