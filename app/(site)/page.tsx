import Link from "next/link";
import { Suspense } from "react";
import { Names } from "@/components/names";
import { RandomPicks } from "@/components/random-picks";
import { ReleaseList } from "@/components/release-list";
import { SectionTitle } from "@/components/section-title";
import { getHomeData, getRandomReleases } from "@/lib/public-data";

const RANDOM_COUNT = 7;

// Cached with the page (a new set about once a minute); Shuffle fetches others in the browser
async function RandomReleases({ total }: { total: number }) {
  return <RandomPicks initial={await getRandomReleases(total, RANDOM_COUNT)} total={total} />;
}

function PicksSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div>
        <div className="aspect-square w-full rounded-sm bg-muted" />
        <div className="mt-3 h-6 w-3/4 rounded-sm bg-muted" />
      </div>
      <ul>
        {Array.from({ length: RANDOM_COUNT - 1 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 border-b py-2.5">
            <div className="aspect-square w-14 rounded-sm bg-muted" />
            <div className="h-4 w-1/2 rounded-sm bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-12">
      <div className="space-y-3 pt-6">
        <div className="h-9 w-2/3 rounded-sm bg-muted" />
        <div className="h-4 w-1/2 rounded-sm bg-muted" />
        <div className="h-4 w-1/4 rounded-sm bg-muted" />
      </div>
      <PicksSkeleton />
    </div>
  );
}

async function HomeContent() {
  const { releases, artists, counts } = await getHomeData();
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-3 pt-6">
        <h1 className="text-4xl font-bold">Ethiopian Music</h1>
        <p className="max-w-2xl text-lg">
          An open archive of releases, tracks and liner-note credits in English and አማርኛ.
        </p>
        <p className="text-sm font-semibold">
          {counts.releases} releases · {counts.artists} artists · {counts.tracks} tracks
        </p>
      </section>

      {counts.releases > 0 && (
        <section>
          <Suspense fallback={<><SectionTitle>Random Picks</SectionTitle><PicksSkeleton /></>}>
            <RandomReleases total={counts.releases} />
          </Suspense>
        </section>
      )}

      <section>
        <SectionTitle>Recently Added Releases</SectionTitle>
        <ReleaseList items={releases} twoColumns />
      </section>

      <section>
        <SectionTitle>Recently Added Artists</SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {artists.map((a) => (
            <li key={a.id}>
              <Link href={`/artists/${a.id}`} className="inline-block rounded border px-2 py-0.5 text-sm hover:bg-muted">
                <Names en={a.name_en} am={a.name_am} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
