import Link from "next/link";
import { Cover } from "@/components/cover";
import { artistNames, type GridRelease } from "@/components/release-grid";

// One release per row with a small cover, like a record-shop catalogue
export function ReleaseList({ items, twoColumns = false }: { items: GridRelease[]; twoColumns?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No releases yet.</p>;
  return (
    <ul className={twoColumns ? "grid grid-cols-1 gap-x-8 md:grid-cols-2" : ""}>
      {items.map((r) => (
        <li key={r.id} className={`border-b last:border-b-0 ${twoColumns && items.length % 2 === 0 ? "md:[&:nth-last-child(2)]:border-b-0" : ""}`}>
          <Link href={`/releases/${r.id}`} className="group flex items-center gap-3 py-2.5 text-foreground">
            <Cover cover_key={r.cover_key} youtube_video_id={r.youtube_video_id} title={r.title_en} className="w-14 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold group-hover:underline">{r.title_en}</p>
              {r.title_am && <p lang="am" className="truncate text-sm text-muted-foreground">{r.title_am}</p>}
              <p className="truncate text-sm text-muted-foreground">{artistNames(r)}</p>
            </div>
            <div className="shrink-0 text-right text-sm text-muted-foreground">
              {r.release_year && <p className="font-semibold text-foreground">{r.release_year}</p>}
              {r.format && <p>{r.format}</p>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// A large cover with the details beside it, for the first random pick
export function FeaturedRelease({ r }: { r: GridRelease }) {
  return (
    <Link href={`/releases/${r.id}`} className="group block text-foreground">
      <Cover cover_key={r.cover_key} youtube_video_id={r.youtube_video_id} title={r.title_en} className="w-2/3 rounded-sm md:w-full" />
      <h3 className="mt-3 text-2xl font-bold leading-tight group-hover:underline">{r.title_en}</h3>
      {r.title_am && <p lang="am" className="text-lg text-muted-foreground">{r.title_am}</p>}
      <p className="mt-1 font-semibold">{artistNames(r)}</p>
      <p className="text-sm text-muted-foreground">{[r.release_year, r.format].filter(Boolean).join(" · ")}</p>
    </Link>
  );
}
