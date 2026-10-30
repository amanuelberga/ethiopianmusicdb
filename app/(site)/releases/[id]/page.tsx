import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getRecentIds, getReleaseMeta } from "@/lib/public-data";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Cover, coverUrl } from "@/components/cover";
import { EditionControls } from "@/components/edition-controls";
import { LockControls } from "@/components/lock-controls";
import { Names } from "@/components/names";
import { DetailSkeleton } from "@/components/page-skeleton";
import { recordTag, tagList, UUID_RE } from "@/lib/cache-tags";
import { displayLinks } from "@/lib/streaming-links";
import { createPublicClient } from "@/lib/supabase/public";
import { EDITION_SELECT, formatDuration, type ArtistRef, type EditionOf, type EditionRef, type ReleaseCard, type RoleRef } from "@/lib/types";

type Credit = { credited_as: string | null; notes: string | null; artists: ArtistRef; credit_roles: RoleRef & { id: string } };
type TrackRow = {
  id: string; disc_number: number; side: string; position: number;
  title_en: string; title_am: string | null; duration_seconds: number | null;
  track_artists: { is_featured: boolean; position: number; artists: ArtistRef }[];
  track_credits: Credit[];
};
type ReleaseFull = ReleaseCard & EditionOf & {
  catalog_number: string | null;
  release_year_ec: number | null;
  streaming_links: Record<string, unknown> | null;
  notes: string | null;
  is_locked: boolean;
  source: string | null;
  source_id: string | null;
  source_quality: string | null;
  labels: { id: string; name_en: string; name_am: string | null } | null;
  release_artists: { position: number; artists: ArtistRef }[];
  release_credits: Credit[];
  tracks: TrackRow[];
};

// Discogs-style "Role – Name, Name" lines
function CreditLines({ credits, showAm = false }: { credits: Credit[]; showAm?: boolean }) {
  const byRole = new Map<string, Credit[]>();
  for (const c of credits) {
    const k = c.credit_roles.role_en;
    byRole.set(k, [...(byRole.get(k) ?? []), c]);
  }
  return (
    <div className="space-y-0.5 text-[14px] text-muted-foreground">
      {[...byRole.entries()].map(([role, cs]) => (
        <div key={role}>
          <span>{role}{cs[0].credit_roles.role_am && <> · <span lang="am">{cs[0].credit_roles.role_am}</span></>} – </span>
          {cs.map((c, i) => (
            <span key={c.artists.id}>
              {i > 0 && ", "}
              <Link href={`/artists/${c.artists.id}`} title={c.artists.name_am ?? undefined} className="text-foreground hover:underline">
                {c.artists.name_en}
                {showAm && c.artists.name_am && c.artists.name_am !== c.artists.name_en && <> <span lang="am">{c.artists.name_am}</span></>}
              </Link>
              {c.credited_as && c.credited_as !== c.artists.name_en && <span> (as {c.credited_as})</span>}
              {c.notes && <span> ({c.notes})</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function EditionList({ items }: { items: EditionRef[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {items.map((e) => (
          <tr key={e.id} className="border-b align-top">
            <td className="py-1.5 pr-3"><Link href={`/releases/${e.id}`} className="hover:underline">{e.title_en}</Link></td>
            <td className="py-1.5 pr-3 text-muted-foreground">{e.format}, {e.type}</td>
            <td className="py-1.5 pr-3">
              {e.labels && <Link href={`/labels/${e.labels.id}`} className="hover:underline"><Names en={e.labels.name_en} am={e.labels.name_am} /></Link>}
              {e.catalog_number && <span className="text-muted-foreground"> · {e.catalog_number}</span>}
            </td>
            <td className="w-14 py-1.5 text-right text-muted-foreground">{e.release_year ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 border-b py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Cached for everyone (no cookies), tagged with this release and every record it shows; lib/refresh.ts
// expires the tags after a save. A failed read throws, so it is never cached.
async function getReleasePage(id: string) {
  "use cache";
  cacheLife("hours"); // edits made in the app clear it at once (lib/refresh.ts)
  if (!UUID_RE.test(id)) return null;
  const db = createPublicClient();
  const { data, error } = await db
    .from("releases")
    .select(`*,
      labels(id,name_en,name_am),
      release_artists(position, artists(id,name_en,name_am)),
      release_credits(credited_as, notes, artists(id,name_en,name_am), credit_roles(id,role_en,role_am)),
      tracks(id,disc_number,side,position,title_en,title_am,duration_seconds,
        track_artists(is_featured, position, artists(id,name_en,name_am)),
        track_credits(credited_as, notes, artists(id,name_en,name_am), credit_roles(id,role_en,role_am)))`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Database read failed: ${error.message}`);
  if (!data) {
    cacheTag(...tagList(recordTag("release", id), []));
    return null;
  }
  const r = data as unknown as ReleaseFull;

  // A main release lists its editions; an edition shows its main release and the other editions of it.
  const mainId = r.edition_of ?? r.id;
  const [eds, main] = await Promise.all([
    db.from("releases").select(EDITION_SELECT).eq("edition_of", mainId).order("release_year", { ascending: true, nullsFirst: false }),
    r.edition_of ? db.from("releases").select("id,title_en").eq("id", r.edition_of).maybeSingle() : null,
  ]);
  if (eds.error || main?.error) throw new Error("Database read failed");
  const allEditions = (eds.data ?? []) as unknown as EditionRef[];
  const mainRelease = (main?.data ?? null) as unknown as { id: string; title_en: string } | null;

  const credits = [...r.release_credits, ...r.tracks.flatMap((t) => t.track_credits)];
  const people = [...r.release_artists, ...credits, ...r.tracks.flatMap((t) => t.track_artists)].map((x) => x.artists.id);
  cacheTag(...tagList(recordTag("release", id), [
    ...(mainRelease ? [recordTag("release", mainRelease.id)] : []),
    ...allEditions.map((e) => recordTag("release", e.id)),
    ...(r.labels ? [recordTag("label", r.labels.id)] : []),
    ...people.map((a) => recordTag("artist", a)),
    ...credits.map((c) => recordTag("role", c.credit_roles.id)),
  ]));
  return { r, editions: allEditions.filter((e) => e.id !== r.id), mainRelease };
}

async function ReleaseContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getReleasePage(id);
  if (!page) notFound();
  const { r, editions, mainRelease } = page;

  const artists = [...r.release_artists].sort((a, b) => a.position - b.position);
  const tracks = [...r.tracks].sort(
    (a, b) => a.disc_number - b.disc_number || a.side.localeCompare(b.side) || a.position - b.position,
  );
  // Contributor-supplied URLs: only https links on each service's own host are shown (see lib/streaming-links)
  const links = displayLinks(r.streaming_links);
  // the cover video gets its own link unless it is already one of the listed links
  const coverVideo = r.youtube_video_id && !links.some((l) => l.url.includes(r.youtube_video_id!)) ? r.youtube_video_id : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <Cover cover_key={r.cover_key} youtube_video_id={r.youtube_video_id} title={r.title_en} className="w-full border" />

        <div>
          <h1 className="text-2xl font-bold leading-tight">
            {artists.map(({ artists: a }, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link href={`/artists/${a.id}`} className="hover:underline">{a.name_en}</Link>
              </span>
            ))}
            {" – "}
            {r.title_en}
          </h1>
          {r.title_am && <p lang="am" className="text-lg text-muted-foreground">{r.title_am}</p>}
          {mainRelease && (
            <p className="mt-2 rounded border border-warn px-3 py-2 text-sm">
              This is an edition of <Link href={`/releases/${mainRelease.id}`} className="font-medium underline">{mainRelease.title_en}</Link>.
            </p>
          )}

          <p className="mt-2 text-sm"><Link href={`/releases/${r.id}/edit`} className="underline">Edit / suggest changes</Link></p>
          <LockControls table="releases" id={r.id} locked={r.is_locked} name={r.title_en}>
            <EditionControls releaseId={r.id} editionOf={r.edition_of} hasEditions={!r.edition_of && editions.length > 0} />
          </LockControls>

          <dl className="mt-4 border-t text-sm">
            {r.labels && <Row label="Label"><Link href={`/labels/${r.labels.id}`} className="hover:underline"><Names en={r.labels.name_en} am={r.labels.name_am} /></Link></Row>}
            {r.catalog_number && <Row label="Catalog #">{r.catalog_number}</Row>}
            <Row label="Format">{r.format}, {r.type}</Row>
            {r.release_year && (
              <Row label="Released">
                {r.release_year}{r.release_year_ec ? ` (E.C. ${r.release_year_ec})` : ""}
              </Row>
            )}
            {(links.length > 0 || coverVideo) && (
              <Row label="Listen">
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="nofollow ugc noopener noreferrer" className="underline">{l.label}</a>
                  ))}
                  {coverVideo && (
                    <a href={`https://www.youtube.com/watch?v=${coverVideo}`} target="_blank" rel="noopener noreferrer" className="underline">
                      YouTube video
                    </a>
                  )}
                </span>
              </Row>
            )}
            {r.source === "discogs" && (
              <Row label="Source">
                <span>
                  Imported from{" "}
                  <a href={`https://www.discogs.com/release/${r.source_id}`} target="_blank" rel="noreferrer" className="underline">Discogs</a>
                  {r.source_quality ? ` (data quality: ${r.source_quality})` : ""}. Often incomplete,{" "}
                  <Link href={`/releases/${r.id}/edit`} className="underline">help improve it</Link>.{" "}
                  <Link href="/about-data" className="underline">How this was imported</Link>.
                </span>
              </Row>
            )}
          </dl>
        </div>
      </div>

      {editions.length > 0 && (
        <section>
          <h2 className="dg-h">Other editions ({editions.length})</h2>
          <EditionList items={editions} />
        </section>
      )}

      <section>
        <h2 className="dg-h">Tracklist</h2>
        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracks added yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {tracks.map((t) => {
                const performers = [...t.track_artists].sort((a, b) => a.position - b.position);
                return (
                  <tr key={t.id} id={`track-${t.id}`} className="scroll-mt-20 border-b align-top">
                    <td className="w-12 py-2.5 pr-2 text-muted-foreground">{t.side}{t.position}</td>
                    <td className="py-2.5">
                      <div className="font-medium"><Names en={t.title_en} am={t.title_am} /></div>
                      {performers.length > 0 && (
                        <div className="text-[14px] text-muted-foreground">
                          {performers.map(({ artists: a, is_featured }, i) => (
                            <span key={a.id}>
                              {i > 0 && ", "}
                              {is_featured && "feat. "}
                              <Link href={`/artists/${a.id}`} className="text-foreground hover:underline">{a.name_en}</Link>
                            </span>
                          ))}
                        </div>
                      )}
                      {t.track_credits.length > 0 && <div className="mt-1"><CreditLines credits={t.track_credits} /></div>}
                    </td>
                    <td className="w-16 py-2.5 text-right text-muted-foreground">{formatDuration(t.duration_seconds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="dg-h">Album credits</h2>
        {r.release_credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No album credits yet.</p>
        ) : (
          <CreditLines credits={r.release_credits} showAm />
        )}
      </section>

      {r.notes && (
        <section>
          <h2 className="dg-h">Notes</h2>
          <p className="whitespace-pre-line">{r.notes}</p>
        </section>
      )}
    </div>
  );
}

// The newest releases are prerendered at build; any other release is rendered on its first visit and cached.
export async function generateStaticParams() {
  return getRecentIds("releases");
}

export default function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ReleaseContent params={params} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await getReleaseMeta(id);
  if (!r) return { title: "Release not found" };
  const by = [...r.release_artists].sort((a, b) => a.position - b.position).map((x) => x.artists.name_en).join(", ");
  const title = by ? `${r.title_en} – ${by}` : r.title_en;
  const image = coverUrl(r);
  return {
    title,
    description: `${title}${r.release_year ? ` (${r.release_year})` : ""}: tracklist and full credits on Ethiopian Music DB.`,
    // an edition's canonical page is its main release
    alternates: { canonical: `/releases/${r.edition_of ?? id}` },
    openGraph: { title, ...(image ? { images: [image] } : {}) },
  };
}
