"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hitHref, type Hit } from "@/lib/types";

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // highlighted option for keyboard navigation
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("search_all", { q: term, max_results: 8 });
      if (!cancelled) {
        setHits((data ?? []) as unknown as Hit[]);
        setActive(-1);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const show = open && q.trim().length >= 2 && hits.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  const hrefFor = (h: Hit) => hitHref(h) ?? `/search?q=${encodeURIComponent(h.label)}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (q.trim().length < 2 || !hits.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      // -1 means "nothing highlighted"; wrap around through it
      setActive((i) => {
        if (!show) return step > 0 ? 0 : hits.length - 1;
        const next = i + step;
        return next < -1 ? hits.length - 1 : next >= hits.length ? -1 : next;
      });
    } else if (e.key === "Enter" && show && active >= 0) {
      e.preventDefault();
      setOpen(false);
      router.push(hrefFor(hits[active]));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="relative order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-label="Search the archive"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search artists, albums, tracks, roles…"
        // color-scheme dark: the browser's own parts (clear ×, caret) match the fixed dark field in both themes
        className="w-full rounded-md border border-[hsl(var(--header-field-border))] bg-[hsl(var(--header-field-bg))] px-3 py-2 text-base text-[hsl(var(--header-fg))] [color-scheme:dark] placeholder:text-[hsl(var(--header-placeholder))]"
      />
      {show && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-background text-foreground">
          {hits.map((h, i) => (
            <li key={`${h.entity}-${h.entity_id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={hrefFor(h)}
                tabIndex={-1}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-baseline justify-between gap-3 px-3 py-2 hover:bg-muted ${i === active ? "bg-muted" : ""}`}
              >
                <span className="truncate">
                  {h.label}
                  {h.sublabel && <span className="ml-2 text-xs text-muted-foreground">{h.sublabel}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{h.entity}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
