"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { ImportResult } from "@/lib/import-link";

const noop = () => () => {};

/**
 * "Fill from the album's YouTube link" (step 2 of /contribute): asks /api/import-link for details and hands them to the form, which
 * decides what to fill and returns the status text. Nothing is saved here. `artists` are the names typed in step 1,
 * sent so they can be removed from the start of track titles.
 */
export function ImportFromLink({ artists, onFill }: { artists: string[]; onFill: (r: ImportResult) => string }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  // false during server rendering and until hydration, so the button can't be pressed before it works
  const ready = useSyncExternalStore(noop, () => true, () => false);

  async function fill() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setStatus({ text: "Reading the link…", error: false });
    try {
      const res = await fetch("/api/import-link", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), artists }),
      });
      const body = (await res.json().catch(() => null)) as (ImportResult & { error?: string }) | null;
      if (!res.ok || !body || body.error) {
        setStatus({ text: body?.error ?? "Something went wrong. Please try again.", error: true });
        return;
      }
      setStatus({ text: [onFill(body), body.notice].filter(Boolean).join(" "), error: false });
    } catch {
      setStatus({ text: "Couldn't reach the site. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded border p-3">
      <label htmlFor={id} className="block text-sm font-medium">Fill from the album&apos;s YouTube link</label>
      <p className="text-xs text-muted-foreground">
        Best results: open the artist&apos;s YouTube channel, go to the Releases tab, open the album and copy its link.
        That playlist has the English and Amharic titles. A link from YouTube Music works too, but it only has English
        titles. You can also paste a single video link. Spotify and other links can be added in the Listen section.
      </p>
      <div className="space-y-2">
        <input
          id={id}
          type="url"
          inputMode="url"
          className="w-full rounded border bg-background px-2 py-1.5 text-sm"
          placeholder="https://…"
          maxLength={500}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          // Enter here must not submit the surrounding check form
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fill(); } }}
        />
        <button type="button" onClick={fill} disabled={!ready || busy || !url.trim()} className="rounded border px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
          {busy ? "Reading…" : "Fill from link"}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`min-h-[1rem] text-xs ${status?.error ? "text-danger" : "text-muted-foreground"}`}>
        {status?.text ?? ""}
      </p>
    </div>
  );
}
