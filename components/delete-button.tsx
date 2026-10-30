"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIND_OF } from "@/lib/cache-tags";
import { friendlyDbError, NOTHING_CHANGED } from "@/lib/form-utils";
import { refreshRecords } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/client";

type Table = "releases" | "artists" | "labels";
const AFTER: Record<Table, string> = { releases: "/releases", artists: "/artists", labels: "/" };

// Staff-only (shown only to admins/moderators; the database enforces it too).
export function DeleteButton({ table, id, name }: { table: Table; id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    let warning = "";
    if (table === "artists") {
      const count = async (t: string) =>
        (await supabase.from(t).select("*", { count: "exact", head: true }).eq("artist_id", id)).count ?? 0;
      const [rels, rc, tc] = await Promise.all([count("release_artists"), count("release_credits"), count("track_credits")]);
      warning = ` They are listed on ${rels} release(s) and have ${rc + tc} credit(s); those links and credits will be removed too.`;
    } else if (table === "releases") {
      warning = " Its tracks and credits will be removed too.";
      // edition_of is ON DELETE SET NULL, so editions of this release are kept but unlinked
      const editions = (await supabase.from("releases").select("*", { count: "exact", head: true }).eq("edition_of", id)).count ?? 0;
      if (editions) warning += ` ${editions} edition${editions > 1 ? "s" : ""} will become standalone release${editions > 1 ? "s" : ""}.`;
    } else {
      warning = " Releases from this label will stay, but lose the label.";
    }
    if (!window.confirm(`Delete “${name}”?${warning} This cannot be undone.`)) {
      setBusy(false);
      return;
    }
    const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
    if (error || !data?.length) {
      setBusy(false);
      return setErr(error ? friendlyDbError(error) : NOTHING_CHANGED);
    }
    // expires the deleted record's page and title, the pages that listed it, and the home page and lists
    await refreshRecords([{ kind: KIND_OF[table], id }]).catch(() => {});
    setBusy(false);
    router.push(AFTER[table]);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={remove}
        disabled={busy}
        className="rounded border border-danger px-3 py-1 text-sm text-danger hover:bg-muted disabled:opacity-50"
      >
        {busy ? "Working…" : "Delete"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
