"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { parsePeople } from "@/lib/form-utils";
import { createClient } from "@/lib/supabase/client";
import type { Hit } from "@/lib/types";

// Live suggestions for step 1 of the contribute form, so people pick existing artists and spot
// existing releases while typing. Search is English-only, like the header search box.

function useHits(term: string, entity: "artist" | "release"): Hit[] {
  const [hits, setHits] = useState<Hit[]>([]);
  const t = term.trim();
  useEffect(() => {
    if (t.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc("search_all", { q: t, max_results: 30 });
      if (!cancelled) setHits(((data ?? []) as unknown as Hit[]).filter((h) => h.entity === entity).slice(0, 6));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [t, entity]);
  return t.length >= 2 ? hits : [];
}

// "A, B / ቢ, C" -> ["A, B / ቢ, ", "C"]: suggestions apply to the name being typed (after the last separator)
const SEP = /(?:,|;|&|\band\b)\s*/gi;
function splitLast(value: string): [string, string] {
  let cut = 0;
  for (const m of value.matchAll(SEP)) cut = (m.index ?? 0) + m[0].length;
  return [value.slice(0, cut), value.slice(cut)];
}

/** An input for one or more artist names, with a dropdown of existing artists matching the name being typed. */
export function ArtistInput({ value, onChange, className, placeholder, ariaLabel = "Release artists" }: {
  value: string; onChange: (v: string) => void; className: string; placeholder?: string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const [prefix, current] = splitLast(value);
  const hits = useHits(current.split("/")[0], "artist");
  const show = open && hits.length > 0;

  function pick(h: Hit) {
    onChange(prefix + h.label);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && hits.length) {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        if (!show) return step > 0 ? 0 : hits.length - 1;
        const next = i + step;
        return next < -1 ? hits.length - 1 : next >= hits.length ? -1 : next;
      });
    } else if (e.key === "Enter" && show && active >= 0) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {show && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-background">
          <ul id={listId} role="listbox" aria-label="Existing artists">
            {hits.map((h, i) => (
              <li
                key={h.entity_id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onClick={() => pick(h)}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-muted ${i === active ? "bg-muted" : ""}`}
              >
                {h.label}
                {h.sublabel && h.sublabel !== h.label && <span className="ml-2 text-xs text-muted-foreground">{h.sublabel}</span>}
              </li>
            ))}
          </ul>
          <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            Pick an existing artist so this is linked to them. A name not in this list creates a new artist.
          </p>
        </div>
      )}
    </div>
  );
}

type Row = {
  id: string; title_en: string; release_year: number | null; format: string;
  release_artists: { position: number; artists: { name_en: string } }[];
};

/** Existing releases whose title matches what is typed; ones sharing a typed artist come first. */
export function ExistingReleases({ title, artists }: { title: string; artists: string }) {
  const hits = useHits(title, "release");
  const ids = hits.map((h) => h.entity_id).join(",");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient().from("releases")
        .select("id,title_en,release_year,format,release_artists(position,artists(name_en))").in("id", ids.split(","));
      if (!cancelled) setRows((data ?? []) as unknown as Row[]);
    })();
    return () => { cancelled = true; };
  }, [ids]);

  const typed = new Set(parsePeople(artists).map((p) => p.name_en.toLowerCase()));
  const order = ids.split(",");
  const list = rows
    .filter((r) => order.includes(r.id))
    .map((r) => {
      const names = [...r.release_artists].sort((a, b) => a.position - b.position).map((x) => x.artists.name_en);
      return { r, names, same: names.some((n) => typed.has(n.toLowerCase())) };
    })
    .sort((a, b) => Number(b.same) - Number(a.same) || order.indexOf(a.r.id) - order.indexOf(b.r.id));
  if (!ids || !list.length) return null;

  return (
    <div className="rounded border p-3 text-sm">
      <p className="mb-1 text-muted-foreground">Releases already in the database with a similar title:</p>
      <ul className="space-y-1">
        {list.map(({ r, names, same }) => (
          <li key={r.id}>
            <Link href={`/releases/${r.id}`} target="_blank" className="font-medium underline">{r.title_en}</Link>
            <span className="text-muted-foreground">
              {" · "}{names.join(", ") || "Unknown artist"}
              {" · "}{[r.release_year, r.format].filter(Boolean).join(", ")}
            </span>
            {same && <span className="ml-2 rounded border border-warn px-1.5 text-xs">same artist</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
