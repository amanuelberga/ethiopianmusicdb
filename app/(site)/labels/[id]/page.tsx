import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getLabelMeta, getRecentIds } from "@/lib/public-data";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LockControls } from "@/components/lock-controls";
import { Names } from "@/components/names";
import { DetailSkeleton } from "@/components/page-skeleton";
import { GRID_SELECT, ReleaseGrid, type GridRelease } from "@/components/release-grid";
import { recordTag, tagList, UUID_RE } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import type { EditionOf } from "@/lib/types";

// Cached for everyone (no cookies), tagged with this label and the releases it lists; lib/refresh.ts expires the
// tags after a save. A failed read throws, so it is never cached.
async function getLabelPage(id: string) {
  "use cache";
  cacheLife("hours"); // edits made in the app clear it at once (lib/refresh.ts)
  if (!UUID_RE.test(id)) return null;
  const supabase = createPublicClient();
  const [label, rels] = await Promise.all([
    supabase.from("labels").select("id,name_en,name_am,is_locked").eq("id", id).maybeSingle(),
    supabase.from("releases").select(`${GRID_SELECT},edition_of`).eq("label_id", id).order("release_year", { ascending: true, nullsFirst: false }),
  ]);
  if (label.error || rels.error) throw new Error("Database read failed");
  const all = (rels.data ?? []) as unknown as (GridRelease & EditionOf)[];
  // release cards show their artists' names
  cacheTag(...tagList(recordTag("label", id), [
    ...all.map((r) => recordTag("release", r.id)),
    ...all.flatMap((r) => r.release_artists.map((x) => recordTag("artist", x.artists.id))),
  ]));
  if (!label.data) return null;
  return { l: label.data as unknown as { id: string; name_en: string; name_am: string | null; is_locked: boolean }, all };
}

async function LabelContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getLabelPage(id);
  if (!page) notFound();
  const { l, all } = page;
  // Hide an edition only when its main release is listed here too; a label that only issued editions
  // (e.g. a reissue label) still lists them, since those are its releases.
  const here = new Set(all.map((r) => r.id));
  const releases = all.filter((r) => !r.edition_of || !here.has(r.edition_of));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Label</p>
        <h1 className="text-3xl font-bold"><Names en={l.name_en} am={l.name_am} /></h1>
        <p className="mt-2 text-sm"><Link href={`/labels/${l.id}/edit`} className="underline">Edit / suggest changes</Link></p>
        <LockControls table="labels" id={l.id} locked={l.is_locked} name={l.name_en} />
      </header>
      <section>
        <h2 className="dg-h">Releases ({releases.length})</h2>
        <ReleaseGrid items={releases} />
      </section>
    </div>
  );
}

// The newest labels are prerendered at build; any other label is rendered on its first visit and cached.
export async function generateStaticParams() {
  return getRecentIds("labels");
}

export default function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <LabelContent params={params} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const l = await getLabelMeta(id);
  if (!l) return { title: "Label not found" };
  return {
    title: l.name_am ? `${l.name_en} / ${l.name_am}` : l.name_en,
    description: `Releases from ${l.name_en} on Ethiopian Music DB.`,
    alternates: { canonical: `/labels/${id}` },
  };
}
