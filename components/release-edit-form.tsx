"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContentEditor } from "@/components/content-editor";
import { ListenLinksEditor } from "@/components/listen-links-editor";
import { Field } from "@/components/field";
import { friendlyDbError, MAX, NOTHING_CHANGED, youtubeId } from "@/lib/form-utils";
import { refreshRecords } from "@/lib/refresh";
import { stateToContent, type EditorState } from "@/lib/release-content";
import { buildLinks, linksToRows, type LinkRow } from "@/lib/streaming-links";
import { createClient } from "@/lib/supabase/client";

export type EditableRelease = {
  id: string; title_en: string; title_am: string | null; release_year: number | null; release_year_ec: number | null;
  catalog_number: string | null; type: string; format: string; youtube_video_id: string | null; notes: string | null;
  streaming_links: Record<string, unknown> | null;
};
const inp = "w-full rounded border bg-background px-2 py-1.5 text-sm";
const num = (s: string) => (s.trim() ? Number(s) : null);
const txt = (s: string) => (s.trim() ? s.trim() : null);

export function ReleaseEditForm({
  release: r, direct, initial, roles, artistIds,
}: { release: EditableRelease; direct: boolean; initial: EditorState; roles: string[]; artistIds: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({
    title_en: r.title_en, title_am: r.title_am ?? "", release_year: r.release_year?.toString() ?? "",
    release_year_ec: r.release_year_ec?.toString() ?? "", catalog_number: r.catalog_number ?? "",
    type: r.type, format: r.format, notes: r.notes ?? "",
    video_url: r.youtube_video_id ? `https://www.youtube.com/watch?v=${r.youtube_video_id}` : "",
  });
  const [ed, setEd] = useState<EditorState>(initial);
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() => linksToRows(r.streaming_links));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value })),
  });
  const fail = (m: string) => { setBusy(false); setErr(m); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.title_en.trim()) return setErr("English title is required.");
    if (!/^\d{0,4}$/.test(f.release_year.trim()) || !/^\d{0,4}$/.test(f.release_year_ec.trim())) return setErr("Years must be numbers.");
    const vid = f.video_url.trim() ? youtubeId(f.video_url) : null;
    if (f.video_url.trim() && !vid) return setErr("Could not read the YouTube link for the cover image.");
    const built = buildLinks(linkRows);
    if ("error" in built) return setErr(built.error);

    const next: Record<string, unknown> = {
      title_en: f.title_en.trim(), title_am: txt(f.title_am), release_year: num(f.release_year),
      release_year_ec: num(f.release_year_ec), catalog_number: txt(f.catalog_number), type: f.type,
      format: f.format, youtube_video_id: vid, notes: txt(f.notes),
    };
    const old: Record<string, unknown> = {
      title_en: r.title_en, title_am: r.title_am, release_year: r.release_year, release_year_ec: r.release_year_ec,
      catalog_number: r.catalog_number, type: r.type, format: r.format, youtube_video_id: r.youtube_video_id, notes: r.notes,
    };
    const diff = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== old[k]));
    // links are an object, so compare their JSON (the stored value read back through the same rules)
    const oldLinks = buildLinks(linksToRows(r.streaming_links));
    if (JSON.stringify(built.links) !== JSON.stringify("links" in oldLinks ? oldLinks.links : r.streaming_links ?? {})) {
      diff.streaming_links = built.links;
    }
    const hasScalar = Object.keys(diff).length > 0;
    const content = stateToContent(ed);
    const contentChanged = JSON.stringify(content) !== JSON.stringify(stateToContent(initial));
    if (!hasScalar && !contentChanged) return setErr("You haven't changed anything.");
    if (!content.artists.length) return setErr("A release needs at least one artist.");

    setBusy(true);
    const supabase = createClient();
    if (direct) {
      if (hasScalar) {
        const { data, error } = await supabase.from("releases").update(diff).eq("id", r.id).select("id");
        if (error) return fail(friendlyDbError(error));
        if (!data?.length) return fail(NOTHING_CHANGED);
      }
      if (contentChanged) {
        const { error } = await supabase.rpc("replace_release_content", { p_release: r.id, p_content: content });
        if (error) {
          // the fields above may already be saved
          if (hasScalar) await refreshRecords([{ kind: "release", id: r.id }], artistIds).catch(() => {});
          return fail(friendlyDbError(error));
        }
      }
      // artistIds: the artists before the save, so removed ones drop the release from their pages too
      await refreshRecords([{ kind: "release", id: r.id }], artistIds).catch(() => {});
      router.push(`/releases/${r.id}`);
      router.refresh();
    } else {
      const note = reason.trim() || null;
      const rows = [
        ...(hasScalar ? [{ target_table: "releases", target_id: r.id, proposed_changes: diff, submitter_notes: note }] : []),
        ...(contentChanged ? [{ target_table: "release_content", target_id: r.id, proposed_changes: content, submitter_notes: note }] : []),
      ];
      const { error } = await supabase.from("edit_proposals").insert(rows);
      if (error) return fail(friendlyDbError(error));
      setBusy(false);
      setDone("Thanks! Your suggested changes were sent to the moderators for review.");
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p>{done}</p>
        <Link href={`/releases/${r.id}`} className="underline">Back to the release</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-8">
      <p className="rounded border p-3 text-sm text-muted-foreground">
        {direct
          ? "You can edit this release directly, so your changes apply immediately."
          : "This release was added by someone else (or is locked), so your changes will be reviewed by a moderator before they go live."}
      </p>

      <section className="space-y-3">
        <h2 className="dg-h">Release details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (English) *"><input className={inp} aria-label="Release title (English)" maxLength={MAX.title} {...bind("title_en")} /></Field>
          <Field label="Title (Amharic)"><input className={inp} aria-label="Release title (Amharic)" maxLength={MAX.title} {...bind("title_am")} /></Field>
          <Field label="Year"><input className={inp} aria-label="Release year" inputMode="numeric" {...bind("release_year")} /></Field>
          <Field label="Year, Ethiopian calendar (optional)"><input className={inp} aria-label="Release year (Ethiopian calendar)" inputMode="numeric" {...bind("release_year_ec")} /></Field>
          <Field label="Type"><select className={inp} aria-label="Release type" {...bind("type")}>{["Album", "Single", "EP", "Compilation"].map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Format"><select className={inp} aria-label="Format" {...bind("format")}>{["Cassette", "Vinyl", "CD", "Digital", "Other"].map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Catalog number"><input className={inp} aria-label="Catalog number" maxLength={MAX.catalog} {...bind("catalog_number")} /></Field>
          <Field label="YouTube video link" hint="Its thumbnail is used as the cover." className="sm:col-span-2">
            <input className={inp} type="url" inputMode="url" {...bind("video_url")} />
          </Field>
        </div>
        <Field label="Notes"><textarea className={inp} rows={3} aria-label="Notes" maxLength={MAX.notes} {...bind("notes")} /></Field>
      </section>

      <section className="space-y-3">
        <h2 className="dg-h">Listen</h2>
        <ListenLinksEditor rows={linkRows} onChange={setLinkRows} />
      </section>

      <ContentEditor value={ed} onChange={setEd} roles={roles} />

      {!direct && (
        <Field label="Why this change? (your source)">
          <textarea className={inp} rows={2} aria-label="Reason for the change" maxLength={MAX.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
      <button disabled={busy} className="rounded bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-60">
        {busy ? "Saving…" : direct ? "Save changes" : "Submit for review"}
      </button>
    </form>
  );
}
