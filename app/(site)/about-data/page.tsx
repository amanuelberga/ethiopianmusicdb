import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "About the data",
  description: "How part of the catalogue was seeded from the Discogs data dump, and what was cleaned up.",
};

// Set to true if you loaded with `build_seed.py --video-covers`
const VIDEO_COVERS = true;

async function getImportCounts() {
  "use cache";
  cacheLife("hours");
  const db = createPublicClient();
  const [r, a] = await Promise.all([
    db.from("releases").select("*", { count: "exact", head: true }).eq("source", "discogs"),
    db.from("artists").select("*", { count: "exact", head: true }).eq("source", "discogs"),
  ]);
  return { releases: r.error ? null : r.count, artists: a.error ? null : a.count };
}

export default async function AboutDataPage() {
  const counts = await getImportCounts();
  return (
    <article className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">About the data</h1>
        <p className="text-sm text-muted-foreground">How part of this archive was seeded from Discogs</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Where it comes from</h2>
        <p>
          Many Ethiopian recordings have little or no documentation online, so we started from an existing public catalogue. The
          October 2026 monthly data dump from{" "}
          <a href="https://www.discogs.com/data/" target="_blank" rel="noreferrer" className="underline">Discogs</a>, which Discogs
          publishes under the CC0 public-domain dedication, was filtered for Ethiopia-related records and cleaned before import.
          Thank you to the many Discogs contributors who built that catalogue.
        </p>
        {counts.releases != null && (
          <p>
            Today {counts.releases.toLocaleString("en-US")} releases{counts.artists != null ? ` and ${counts.artists.toLocaleString("en-US")} artists` : ""} in
            this archive come from that import.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What was imported</h2>
        <p>
          Release titles, years, formats, labels and catalogue numbers; tracklists with durations; artists and their credits (writers,
          producers, musicians, studios); alternate spellings of names, including Ge&apos;ez spellings, and short artist biographies; the
          release notes written by Discogs contributors; and Discogs&apos; own data-quality rating for each release. Each imported
          release shows where it came from and links back to its Discogs page.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What was not imported</h2>
        <p>
          Cover images, ratings and reviews, marketplace and price data, and genre and style tags.
          {VIDEO_COVERS ? " Some releases show a thumbnail from a YouTube video that Discogs links to." : ""}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How Ethiopia-related records were chosen</h2>
        <p>
          A release was kept when it was pressed in Ethiopia, when its title, artists, label or tracks use Ge&apos;ez script, or when
          its main artist is shown to be Ethiopian by their own releases, for example by having several releases pressed in Ethiopia.
          Compilations were kept only when several of their tracks are by such artists. Records that merely mention Ethiopia in passing were left out.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What was cleaned up</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Unrelated artists caught by the filter were removed, together with their releases.</li>
          <li>Duplicate artist pages (aliases, spelling variants, English and Ge&apos;ez spellings of the same name) were merged, and the old spellings were kept as aliases.</li>
          <li>Exact duplicate pressings of the same release were left out; different editions, such as an LP and a CD, were kept.</li>
          <li>Artists and releases that were already in this archive were matched, not copied twice.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">A starting point, not the final word</h2>
        <p>
          Discogs records are often incomplete or contain mistakes. Imported records are marked &ldquo;Imported from Discogs&rdquo; and are
          left unlocked, so anyone signed in can propose corrections and additions, which moderators then review. Once a record has been
          checked, moderators may lock it as canonical.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Licence and independence</h2>
        <p>
          The imported catalogue data is CC0, like the rest of our catalogue data (see the{" "}
          <Link href="/data-license" className="underline">data licence</Link>). This project is not affiliated with or endorsed by Discogs.
        </p>
      </section>
    </article>
  );
}
