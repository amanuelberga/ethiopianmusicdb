import Link from "next/link";
import { Cover } from "@/components/cover";
import type { ArtistRef, ReleaseCard } from "@/lib/types";

export type GridRelease = ReleaseCard & { release_artists: { position: number; artists: ArtistRef }[] };
export const GRID_SELECT =
  "id,title_en,title_am,release_year,type,format,cover_key,youtube_video_id,release_artists(position,artists(id,name_en,name_am))";

export function artistNames(r: GridRelease) {
  return [...r.release_artists].sort((a, b) => a.position - b.position).map((ra) => ra.artists.name_en).join(", ");
}

export function ReleaseGrid({ items }: { items: GridRelease[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No releases yet.</p>;
  return (
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={`/releases/${r.id}`} className="group block">
            <Cover cover_key={r.cover_key} youtube_video_id={r.youtube_video_id} title={r.title_en} className="w-full rounded-md" />
            <p className="mt-2 text-sm font-medium group-hover:underline">{r.title_en}</p>
            {r.title_am && <p className="text-xs text-muted-foreground">{r.title_am}</p>}
            <p className="text-xs text-muted-foreground">
              {artistNames(r)}
              {r.release_year ? ` · ${r.release_year}` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
