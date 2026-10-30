import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getArtistMeta, getRecentIds } from "@/lib/public-data";
import Link from "next/link";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/page-skeleton";
import { notFound, redirect } from "next/navigation";
import { Cover } from "@/components/cover";
import { LockControls } from "@/components/lock-controls";
import { Names } from "@/components/names";
import { recordTag, tagList, UUID_RE } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import type { ArtistRef, EditionOf, ReleaseCard, RoleRef } from "@/lib/types";

type Rel = ReleaseCard & EditionOf;
type TrackRef = {
  id: string; title_en: string; title_am: string | null;
  disc_number: number; side: string; position: number; releases: Rel;
};
type TrackEntry = { track: TrackRef; roles: Set<string> };
type Entry = { release: Rel; onCover: boolean; roles: Set<string>; tracks: Map<string, TrackEntry> };

const REL = "id,title_en,title_am,release_year,type,format,cover_key,youtube_video_id,edition_of";
const TRK = `id,title_en,title_am,disc_number,side,position,releases(${REL})`;

function Badges({ roles }: { roles: string[] }) {
  if (!roles.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className="rounded bg-muted px-2 py-0.5 text-xs">{r}</span>
      ))}
    </span>
  );
}

function ReleaseRow({ e }: { e: Entry }) {
  const r = e.release;
  const tracks = [...e.tracks.values()].sort(
    (a, b) =>
      a.track.disc_number - b.track.disc_number ||
      a.track.side.localeCompare(b.track.side) ||
      a.track.position - b.track.position,
  );
  const head = (
    <div className="flex items-center gap-3">
      <Cover cover_key={r.cover_key} youtube_video_id={r.youtube_video_id} title={r.title_en} className="h-12 w-12 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <Link href={`/releases/${r.id}`} className="font-medium hover:underline">
          <Names en={r.title_en} am={r.title_am} />
        </Link>
        <div className="text-xs text-muted-foreground">
          {[r.release_year, r.type, r.format].filter(Boolean).join(" · ")}
          {tracks.length > 0 && ` · ${tracks.length} track${tracks.length > 1 ? "s" : ""} ▾`}
        </div>
        <Badges roles={[...e.roles]} />
      </div>
    </div>
  );

  if (!tracks.length) return <li className="py-3">{head}</li>;

  return (
    <li className="py-3">
      <details>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{head}</summary>
        <ul className="ml-[60px] mt-3 space-y-2 border-l pl-4">
          {tracks.map(({ track: t, roles }) => (
            <li key={t.id} className="text-sm">
              <Link href={`/releases/${t.releases.id}#track-${t.id}`} className="hover:underline">
                <span className="text-muted-foreground">{t.side}{t.position}. </span>
                <Names en={t.title_en} am={t.title_am} />
              </Link>
              <Badges roles={[...roles]} />
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

// Cached for everyone (no cookies), tagged with this artist and every release and artist it shows; lib/refresh.ts
// expires the tags after a save. A failed read throws, so it is never cached.
async function getArtistPage(id: string) {
  "use cache";
  cacheLife("hours"); // edits made in the app clear it at once (lib/refresh.ts)
  if (!UUID_RE.test(id)) return null;
  const supabase = createPublicClient();
  const res = await Promise.all([
    supabase.from("artists").select("*, artist_aliases(alias)").eq("id", id).maybeSingle(),
    supabase.from("release_artists").select(`releases(${REL})`).eq("artist_id", id),
    supabase.from("release_credits").select(`credit_roles(role_en), releases(${REL})`).eq("artist_id", id),
    supabase.from("track_artists").select(`is_featured, tracks(${TRK})`).eq("artist_id", id),
    supabase.from("track_credits").select(`credit_roles(role_en), tracks(${TRK})`).eq("artist_id", id),
    supabase.from("group_members").select("member:artists!group_members_member_id_fkey(id,name_en,name_am)").eq("group_id", id),
    supabase.from("group_members").select("grp:artists!group_members_group_id_fkey(id,name_en,name_am)").eq("member_id", id),
  ]);

  if (res.some((x) => x.error)) throw new Error("Database read failed");
  const [a, onCover, relCredits, trackArtists, trackCredits, members, memberOf] = res;
  if (!a.data) {
    cacheTag(...tagList(recordTag("artist", id), []));
    return null;
  }
  const appearsOn = [
    ...((onCover.data ?? []) as unknown as { releases: Rel }[]).map((x) => x.releases),
    ...((relCredits.data ?? []) as unknown as { releases: Rel }[]).map((x) => x.releases),
    ...((trackArtists.data ?? []) as unknown as { tracks: TrackRef }[]).map((x) => x.tracks.releases),
    ...((trackCredits.data ?? []) as unknown as { tracks: TrackRef }[]).map((x) => x.tracks.releases),
  ];
  // mains of editions this artist appears on, listed in the edition's place (see ArtistContent)
  const direct = new Set(appearsOn.map((r) => r.id));
  const missing = [...new Set(appearsOn.map((r) => r.edition_of))].filter((m): m is string => !!m && !direct.has(m));
  let mains: Rel[] = [];
  if (missing.length) {
    const { data, error } = await supabase.from("releases").select(REL).in("id", missing);
    if (error) throw new Error(`Database read failed: ${error.message}`);
    mains = (data ?? []) as unknown as Rel[];
  }
  const people = [
    ...((members.data ?? []) as unknown as { member: ArtistRef }[]).map((x) => x.member.id),
    ...((memberOf.data ?? []) as unknown as { grp: ArtistRef }[]).map((x) => x.grp.id),
  ];
  cacheTag(...tagList(recordTag("artist", id), [
    ...people.map((p) => recordTag("artist", p)),
    ...[...direct, ...missing].map((r) => recordTag("release", r)),
  ]));
  return { a, onCover, relCredits, trackArtists, trackCredits, members, memberOf, mains };
}

async function ArtistContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getArtistPage(id);
  if (!page) notFound();
  const { a, onCover, relCredits, trackArtists, trackCredits, members, memberOf, mains } = page;
  const artist = a.data!;
  if (artist.merged_into) redirect(`/artists/${artist.merged_into}`);

  // Merge every appearance into one entry per release
  const entries = new Map<string, Entry>();
  const entryFor = (r: Rel): Entry => {
    let e = entries.get(r.id);
    if (!e) {
      e = { release: r, onCover: false, roles: new Set(), tracks: new Map() };
      entries.set(r.id, e);
    }
    return e;
  };
  const trackFor = (t: TrackRef): TrackEntry => {
    const e = entryFor(t.releases);
    let te = e.tracks.get(t.id);
    if (!te) {
      te = { track: t, roles: new Set() };
      e.tracks.set(t.id, te);
    }
    return te;
  };

  for (const row of (onCover.data ?? []) as unknown as { releases: Rel }[])
    entryFor(row.releases).onCover = true;
  for (const row of (relCredits.data ?? []) as unknown as { credit_roles: RoleRef; releases: Rel }[])
    entryFor(row.releases).roles.add(row.credit_roles.role_en);
  for (const row of (trackArtists.data ?? []) as unknown as { is_featured: boolean; tracks: TrackRef }[])
    trackFor(row.tracks).roles.add(row.is_featured ? "Featured artist" : "Performer");
  for (const row of (trackCredits.data ?? []) as unknown as { credit_roles: RoleRef; tracks: TrackRef }[])
    trackFor(row.tracks).roles.add(row.credit_roles.role_en);

  // Editions fold into their main release. The main is listed even when this artist only appears on an
  // edition (its artists may differ), and an edition is never listed next to its main.
  for (const m of mains) entryFor(m);
  for (const e of [...entries.values()]) {
    const main = e.release.edition_of ? entries.get(e.release.edition_of) : undefined;
    if (!main) continue;
    entries.delete(e.release.id);
    main.onCover ||= e.onCover;
    e.roles.forEach((r) => main.roles.add(r));
    // tracks of an edition usually repeat the main's, so take them only when the main has none for this artist
    if (!main.tracks.size) e.tracks.forEach((t, k) => main.tracks.set(k, t));
  }

  const sorted = [...entries.values()].sort(
    (x, y) => (x.release.release_year ?? 9999) - (y.release.release_year ?? 9999),
  );
  const discography = sorted.filter((e) => e.onCover);
  const credits = sorted.filter((e) => !e.onCover);

  const memberList = (members.data ?? []) as unknown as { member: ArtistRef }[];
  const groupList = (memberOf.data ?? []) as unknown as { grp: ArtistRef }[];
  const aliases = ((artist.artist_aliases ?? []) as unknown as { alias: string }[]).map((x) => x.alias);

  return (
    <div className="grid gap-8 md:grid-cols-[260px_1fr]">
      <aside className="text-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{artist.entity_type}</p>
        <h1 className="text-3xl font-bold">
          <Names en={artist.name_en} am={artist.name_am} />
        </h1>
        <p className="mt-2 text-sm"><Link href={`/artists/${artist.id}/edit`} className="underline">Edit / suggest changes</Link></p>
        <LockControls table="artists" id={artist.id} locked={Boolean(artist.is_locked)} name={artist.name_en} />
        {artist.source === "discogs" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Also on{" "}
            <a href={`https://www.discogs.com/artist/${artist.source_id}`} target="_blank" rel="noreferrer" className="underline">Discogs</a>
          </p>
        )}
        {aliases.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">Also known as: {aliases.join(", ")}</p>
        )}
        {(artist.begin_year || artist.end_year) && (
          <p className="text-sm text-muted-foreground">{artist.begin_year ?? "?"} – {artist.end_year ?? ""}</p>
        )}
        {artist.bio_en && <p className="mt-4 max-w-2xl whitespace-pre-line">{artist.bio_en}</p>}
        {artist.bio_am && <p className="mt-2 max-w-2xl whitespace-pre-line text-muted-foreground">{artist.bio_am}</p>}
        {memberList.length > 0 && (
          <p className="mt-4 text-sm">
            <span className="text-muted-foreground">Members: </span>
            {memberList.map(({ member }, i) => (
              <span key={member.id}>
                {i > 0 && ", "}
                <Link href={`/artists/${member.id}`} className="hover:underline">{member.name_en}</Link>
              </span>
            ))}
          </p>
        )}
        {groupList.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Member of: </span>
            {groupList.map(({ grp }, i) => (
              <span key={grp.id}>
                {i > 0 && ", "}
                <Link href={`/artists/${grp.id}`} className="hover:underline">{grp.name_en}</Link>
              </span>
            ))}
          </p>
        )}
      </aside>

      <div className="flex flex-col gap-8">

      <section>
        <h2 className="dg-h">Discography</h2>
        {discography.length === 0 ? (
          <p className="text-sm text-muted-foreground">No releases yet.</p>
        ) : (
          <ul className="divide-y">{discography.map((e) => <ReleaseRow key={e.release.id} e={e} />)}</ul>
        )}
      </section>

      {credits.length > 0 && (
        <section>
          <h2 className="dg-h">Credits &amp; appearances</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Releases and tracks where {artist.name_en} is credited but not the main artist.
          </p>
          <ul className="divide-y">{credits.map((e) => <ReleaseRow key={e.release.id} e={e} />)}</ul>
        </section>
      )}
      </div>
    </div>
  );
}

// The newest artists are prerendered at build; any other artist is rendered on its first visit and cached.
export async function generateStaticParams() {
  return getRecentIds("artists");
}

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ArtistContent params={params} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = await getArtistMeta(id);
  if (!a) return { title: "Artist not found" };
  const title = a.name_am ? `${a.name_en} / ${a.name_am}` : a.name_en;
  return {
    title,
    description: a.bio_en ? a.bio_en.slice(0, 155) : `Discography and credits for ${a.name_en} on Ethiopian Music DB.`,
    alternates: { canonical: `/artists/${id}` },
  };
}
