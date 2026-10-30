"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendlyDbError, NOTHING_CHANGED } from "@/lib/form-utils";
import { refreshRecords } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/client";
import type { Hit } from "@/lib/types";

type Candidate = {
  id: string; title_en: string; release_year: number | null; format: string;
  release_artists: { position: number; artists: { name_en: string } }[];
};
const btn = "rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50";

// Staff-only (rendered inside LockControls' staff row; the RPCs enforce it too). Returns inline items for that
// flex row; the search panel takes a full row of its own.
export function EditionControls({ releaseId, editionOf, hasEditions }: { releaseId: string; editionOf: string | null; hasEditions: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The RPCs return nothing, so read edition_of back to tell "done" from "nothing changed".
  async function run(call: PromiseLike<{ error: { code?: string; message: string } | null }>, expected: string | null) {
    setBusy(true);
    setErr(null);
    const { error } = await call;
    if (error) {
      setBusy(false);
      return setErr(friendlyDbError(error));
    }
    const { data } = await createClient().from("releases").select("edition_of").eq("id", releaseId).maybeSingle();
    if ((data as { edition_of: string | null } | null)?.edition_of !== expected) {
      setBusy(false);
      return setErr(NOTHING_CHANGED);
    }
    // this release, the main it left (unlink) and the main it joined (link)
    const mains = [editionOf, expected].filter((m): m is string => !!m);
    await refreshRecords([releaseId, ...mains].map((id) => ({ kind: "release" as const, id }))).catch(() => {});
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    // search_all already leaves editions out, so every hit can be a main release
    const { data, error } = await supabase.rpc("search_all", { q: term, max_results: 60 });
    if (error) {
      setBusy(false);
      return setErr(friendlyDbError(error));
    }
    const ids = ((data ?? []) as Hit[]).filter((h) => h.entity === "release" && h.entity_id !== releaseId).map((h) => h.entity_id).slice(0, 15);
    const rows = ids.length
      ? ((await supabase.from("releases").select("id,title_en,release_year,format,release_artists(position,artists(name_en))").in("id", ids)).data ?? [])
      : [];
    const byId = new Map((rows as unknown as Candidate[]).map((r) => [r.id, r]));
    setHits(ids.map((id) => byId.get(id)).filter((r): r is Candidate => !!r));
    setBusy(false);
  }

  if (editionOf) {
    return (
      <>
        <button disabled={busy} className={btn} title="Unlink this edition from its main release" onClick={() => run(createClient().rpc("unlink_release_edition", { p_edition: releaseId }), null)}>
          {busy ? "Working…" : "Unlink"}
        </button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </>
    );
  }
  // A release with editions of its own cannot become an edition (no chains).
  if (hasEditions) return null;

  return (
    <>
      <button className={btn} title="Link this release as an edition of another" onClick={() => setOpen((o) => !o)}>Link edition…</button>
      {open && (
        <div className="basis-full space-y-2 rounded border p-3">
          <form onSubmit={search} className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search for the main release"
              placeholder="Search the main release by title"
              className="w-full rounded border bg-background px-2 py-1 text-sm"
            />
            <button disabled={busy} className={btn}>{busy ? "…" : "Search"}</button>
          </form>
          {hits && hits.length === 0 && <p className="text-xs text-muted-foreground">No main releases found.</p>}
          {hits && hits.length > 0 && (
            <ul className="divide-y">
              {hits.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span>
                    <span className="font-medium">{h.title_en}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {[...h.release_artists].sort((a, b) => a.position - b.position).map((x) => x.artists.name_en).join(", ") || "Unknown artist"}
                      {" · "}
                      {[h.release_year, h.format].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <button
                    disabled={busy}
                    className={btn}
                    onClick={() => run(createClient().rpc("link_release_edition", { p_edition: releaseId, p_main: h.id }), h.id)}
                  >
                    Link
                  </button>
                </li>
              ))}
            </ul>
          )}
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      )}
      {!open && err && <span className="text-xs text-danger">{err}</span>}
    </>
  );
}
