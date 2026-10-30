"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { friendlyDbError } from "@/lib/form-utils";
import { refreshRecords } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/client";

type A = { id: string; name_en: string; name_am: string | null };

function Picker({ label, value, onChange }: { label: string; value: A | null; onChange: (a: A | null) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<A[]>([]);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let off = false;
    const timer = setTimeout(async () => {
      const { data } = await createClient().from("artists").select("id,name_en,name_am")
        .is("merged_into", null).ilike("name_en", `%${term}%`).limit(8);
      if (!off) setRes((data ?? []) as A[]);
    }, 250);
    return () => { off = true; clearTimeout(timer); };
  }, [term]);

  if (value) {
    return (
      <div className="rounded border p-3 text-sm">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value.name_en} {value.name_am && <span className="text-muted-foreground">{value.name_am}</span>}</p>
        <Link href={`/artists/${value.id}`} target="_blank" className="mr-3 text-xs underline">View</Link>
        <button type="button" className="text-xs underline" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div className="rounded border p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={`${label}: search artist name`} placeholder="Search artist name…" className="w-full rounded border bg-background px-2 py-1.5" />
      {term.length >= 2 && (
        <ul className="mt-2 space-y-1">
          {res.map((a) => (
            <li key={a.id}>
              <button type="button" className="hover:underline" onClick={() => { onChange(a); setQ(""); }}>
                {a.name_en} {a.name_am && <span className="text-muted-foreground">{a.name_am}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ArtistMerge() {
  const [src, setSrc] = useState<A | null>(null);
  const [tgt, setTgt] = useState<A | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function merge() {
    if (!src || !tgt) return;
    if (!window.confirm(`Merge “${src.name_en}” into “${tgt.name_en}”? All credits move to “${tgt.name_en}” and this cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { error } = await createClient().rpc("merge_artists", { p_source: src.id, p_target: tgt.id });
    if (error) {
      setBusy(false);
      return setErr(friendlyDbError(error));
    }
    // the duplicate's tag also clears every release page that credited it
    await refreshRecords([{ kind: "artist", id: src.id }, { kind: "artist", id: tgt.id }]).catch(() => {});
    setBusy(false);
    setMsg(`Merged “${src.name_en}” into “${tgt.name_en}”.`);
    setSrc(null);
    setTgt(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Pick the duplicate (it will redirect) and the artist to keep.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Picker label="Duplicate to merge away" value={src} onChange={setSrc} />
        <Picker label="Artist to keep" value={tgt} onChange={setTgt} />
      </div>
      <button disabled={busy || !src || !tgt || src.id === tgt?.id} onClick={merge} className="rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50">
        {busy ? "Merging…" : "Merge artists"}
      </button>
      {msg && <p className="text-sm text-ok">{msg}</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
