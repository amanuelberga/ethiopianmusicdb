"use client";

import { useState } from "react";
import { GRID_SELECT, type GridRelease } from "@/components/release-grid";
import { FeaturedRelease, ReleaseList } from "@/components/release-list";
import { SectionTitle } from "@/components/section-title";
import { ShuffleButton } from "@/components/shuffle-button";
import { createClient } from "@/lib/supabase/client";

// The first picks come with the cached page (they change about once a minute). Shuffle reads new ones
// straight from Supabase in the browser, so it runs no server code.
export function RandomPicks({ initial, total }: { initial: GridRelease[]; total: number }) {
  const [picks, setPicks] = useState(initial);
  const [pending, setPending] = useState(false);

  async function shuffle() {
    setPending(true);
    // Same sampling as getRandomReleases: ids are random UUIDs, so a slice from a random offset is a random sample
    const offset = Math.floor(Math.random() * Math.max(1, total - initial.length + 1));
    const { data } = await createClient().from("releases").select(GRID_SELECT).is("edition_of", null)
      .order("id").range(offset, offset + initial.length - 1);
    if (data?.length) setPicks(data as unknown as GridRelease[]);
    setPending(false);
  }

  const [first, ...rest] = picks;
  return (
    <>
      <SectionTitle action={<ShuffleButton onShuffle={shuffle} pending={pending} />}>Random picks</SectionTitle>
      {first ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <FeaturedRelease r={first} />
          <ReleaseList items={rest} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No releases yet.</p>
      )}
    </>
  );
}
