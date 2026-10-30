"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinerScanner } from "@/components/liner-scanner";
import { ArtistInput, ExistingReleases } from "@/components/release-suggest";
import { createClient } from "@/lib/supabase/client";
import { ImportFromLink } from "@/components/import-from-link";
import { ListenLinksEditor } from "@/components/listen-links-editor";
import { Tabs } from "@/components/tabs";
import { friendlyDbError, MAX, parsePeople, toSeconds, youtubeId } from "@/lib/form-utils";
import { normalizeName, type ImportResult } from "@/lib/import-link";
import { refreshRecords } from "@/lib/refresh";
import { buildLinks, SERVICES, type LinkRow } from "@/lib/streaming-links";
import { RemoveIcon } from "@/components/icons";
import { Field } from "@/components/field";

type CreditRow = { role: string; names: string; note: string };
type TrackRow = { title_en: string; title_am: string; side: string; duration: string; performers: string; featured: string; credits: CreditRow[] };
type MainRef = { id: string; title_en: string };
type Match = {
  id: string; title_en: string; artist_names: string | null;
  release_year: number | null; format: string; is_locked: boolean;
  main: MainRef; // the release a new edition would be linked to: the match itself, or its main if it is an edition
};
const emptyTrack = (): TrackRow => ({ title_en: "", title_am: "", side: "", duration: "", performers: "", featured: "", credits: [] });
const hasContent = (t: TrackRow) =>
  [t.title_en, t.title_am, t.side, t.duration, t.performers, t.featured].some((v) => v.trim()) || t.credits.length > 0;
// for comparing the link's title/artist with what was typed: no case, accents or punctuation
const loose = (s: string) => normalizeName(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const inp = "w-full rounded border bg-background px-2 py-1.5 text-sm";

function CreditsEditor({ rows, onChange }: { rows: CreditRow[]; onChange: (r: CreditRow[]) => void }) {
  const upd = (i: number, patch: Partial<CreditRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[140px_1fr_170px_auto]">
          <Field label="Role"><input list="roles" className={inp} aria-label={`Credit ${i + 1} role`} maxLength={MAX.role} value={r.role} onChange={(e) => upd(i, { role: e.target.value })} /></Field>
          <Field label="Names" className="col-span-2 sm:col-span-1" group><ArtistInput className={inp} ariaLabel={`Credit ${i + 1} names`} value={r.names} onChange={(v) => upd(i, { names: v })} /></Field>
          <Field label="Note" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Credit ${i + 1} note`} maxLength={MAX.creditNote} value={r.note} onChange={(e) => upd(i, { note: e.target.value })} /></Field>
          <button type="button" className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto justify-self-start py-2" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove credit"><RemoveIcon /></button>
        </div>
      ))}
      <button type="button" className="text-sm underline" onClick={() => onChange([...rows, { role: "", names: "", note: "" }])}>+ Add credit</button>
    </div>
  );
}

function Matches({ items, onContinue, onEdition }: { items: Match[]; onContinue: () => void; onEdition: (main: MainRef) => void }) {
  return (
    <div className="space-y-3 rounded border border-warn p-4 text-sm">
      <p className="font-medium">This release already exists in the database:</p>
      <ul className="space-y-3">
        {items.map((d) => (
          <li key={d.id}>
            <Link href={`/releases/${d.id}`} target="_blank" className="font-medium underline">{d.title_en}</Link>
            {" · "}{d.artist_names} ({[d.release_year, d.format].filter(Boolean).join(", ")})
            <p className="text-muted-foreground">
              {d.is_locked ? (
                "This release has been reviewed by moderators and its data is deemed canonical, so it can't be changed through edit proposals."
              ) : (
                <>It isn&apos;t locked, so you can <Link href={`/releases/${d.id}/edit`} className="underline">propose edits to it</Link>.</>
              )}
            </p>
            <button type="button" onClick={() => onEdition(d.main)} className="mt-1 rounded border px-2 py-0.5 text-xs hover:bg-muted">
              Add as another edition of {d.main.id === d.id ? "this release" : `“${d.main.title_en}”`}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onContinue} className="text-xs text-muted-foreground underline">
        None of these: add it as a separate release
      </button>
    </div>
  );
}

export function ReleaseForm({ roles, staff }: { roles: string[]; staff: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<"check" | "form">("check");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [editionOf, setEditionOf] = useState<MainRef | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [f, setF] = useState({
    title_en: "", title_am: "", release_year: "", release_year_ec: "", type: "Album", format: "Digital",
    label_en: "", label_am: "", catalog_number: "", artists: "",
    video_url: "", notes: "",
  });
  const [tracks, setTracks] = useState<TrackRow[]>([emptyTrack()]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [linkRows, setLinkRows] = useState<LinkRow[]>([]);
  // "Fill from a link": what differs from the user's entries, an Amharic title to offer, tracks awaiting a yes/no
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [amSuggestion, setAmSuggestion] = useState<string | null>(null);
  const [pendingTracks, setPendingTracks] = useState<TrackRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bind = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value })),
  });
  const updTrack = (i: number, patch: Partial<TrackRow>) => setTracks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const vid = youtubeId(f.video_url);
  const keyOf = () => `${f.title_en.trim().toLowerCase()}|${f.artists.trim().toLowerCase()}`;

  // Looks for an existing release with the same title and a shared artist.
  async function findMatches(): Promise<Match[] | null> {
    const artists = parsePeople(f.artists);
    if (!f.title_en.trim()) { setErr("Enter the release title."); return null; }
    if (!artists.length) { setErr("Enter at least one release artist."); return null; }
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("find_duplicate_releases", {
      p_title: f.title_en.trim(), p_artists: artists.map((a) => a.name_en),
    });
    if (error) { setBusy(false); setErr(`Couldn't check for existing releases: ${friendlyDbError(error)}`); return null; }
    const found = (data ?? []) as unknown as Omit<Match, "main">[];
    // a new edition links to a main release, so resolve matches that are themselves editions to their main
    const eds = found.length ? (await supabase.from("releases").select("id,edition_of").in("id", found.map((m) => m.id))).data ?? [] : [];
    const editionOfId = new Map((eds as { id: string; edition_of: string | null }[]).map((r) => [r.id, r.edition_of]));
    const mainIds = [...new Set([...editionOfId.values()].filter((m): m is string => !!m))];
    const mains = mainIds.length ? (await supabase.from("releases").select("id,title_en").in("id", mainIds)).data ?? [] : [];
    const mainById = new Map((mains as MainRef[]).map((m) => [m.id, m]));
    setBusy(false);
    return found.map((m) => {
      const mainId = editionOfId.get(m.id);
      return { ...m, main: (mainId && mainById.get(mainId)) || { id: m.id, title_en: m.title_en } };
    });
  }

  function proceed() {
    setEditionOf(null);
    setCheckedKey(keyOf());
    setMatches(null);
    setStage("form");
  }

  // "Fill from a link" (step 2). The title and artists from step 1 are never changed (so the duplicate check
  // stays valid); everything else is filled only where the rules below allow. Returns the status text.
  function fillFromLink(r: ImportResult): string {
    const filled: string[] = [];
    const patch: Partial<typeof f> = {};

    // differences from the user's title/artist are only reported
    const titleDiffers = !!r.title.en && loose(r.title.en) !== loose(f.title_en);
    const typed = parsePeople(f.artists);
    const artistDiffers = !!r.artist && !typed.some((p) => loose(p.name_en) === loose(r.artist!.name_en));
    setLinkNote(titleDiffers || artistDiffers
      ? `The link calls this “${r.title.en || r.title.am}”${r.artist ? ` by “${r.artist.name_en}”` : ""}. Your entries were kept.`
      : null);

    // Amharic title: filled only when empty and the link's English title is the one typed; otherwise offered
    setAmSuggestion(null);
    if (r.title.am && r.title.am !== f.title_am.trim()) {
      if (!f.title_am.trim() && r.title.en && !titleDiffers) {
        patch.title_am = r.title.am;
        filled.push("the Amharic title");
      } else setAmSuggestion(r.title.am);
    }
    if (r.year && !f.release_year.trim()) {
      patch.release_year = String(r.year);
      filled.push(`year ${r.year}`);
    }
    if (r.type && r.type !== f.type) {
      patch.type = r.type;
      filled.push(`type ${r.type}`);
    }
    if (r.coverVideoId && youtubeId(f.video_url) !== r.coverVideoId) {
      patch.video_url = `https://www.youtube.com/watch?v=${r.coverVideoId}`;
      filled.push("the cover video");
    }
    setF((p) => ({ ...p, ...patch }));
    if (!linkRows.some((x) => x.url === r.link.url)) {
      setLinkRows((rows) => [...rows.filter((x) => x.url.trim()), r.link]);
      filled.push(`the ${SERVICES[r.link.service]} link`);
    }

    // tracks: fill an empty list; never replace entered tracks without asking (performers stay empty)
    setPendingTracks(null);
    if (r.tracks.length) {
      const rows = r.tracks.map((t) => ({ ...emptyTrack(), title_en: t.en, title_am: t.am, duration: t.duration }));
      const plural = `${rows.length} track${rows.length > 1 ? "s" : ""}`;
      if (!tracks.some(hasContent)) {
        setTracks(rows);
        filled.unshift(plural);
      } else {
        setPendingTracks(rows);
        filled.push(`(${plural} waiting for your answer below)`);
      }
    }
    const list = filled.length ? `Filled ${filled.join(", ")} from the link.` : "Nothing new to fill from the link.";
    return `${list} Your title and artist were kept.`;
  }

  function addAsEdition(main: MainRef) {
    proceed();
    setEditionOf(main);
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const found = await findMatches();
    if (!found) return;
    if (found.length) return setMatches(found);
    proceed();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const artists = parsePeople(f.artists);
    if (!f.title_en.trim()) return setErr("English title is required.");
    if (!artists.length) return setErr("Add at least one release artist.");

    // title/artist changed since the check -> check again
    if (keyOf() !== checkedKey) {
      const found = await findMatches();
      if (!found) return;
      if (found.length) return setMatches(found);
      setCheckedKey(keyOf());
    }

    const toCredits = (rows: CreditRow[]) =>
      rows.filter((r) => r.role.trim() && r.names.trim()).map((r) => ({ role: r.role.trim(), people: parsePeople(r.names), notes: r.note.trim() }));
    if (f.video_url.trim() && !vid) return setErr("Could not read the YouTube link for the cover image.");
    const built = buildLinks(linkRows);
    if ("error" in built) return setErr(built.error);

    const payload = {
      title_en: f.title_en.trim(), title_am: f.title_am.trim(),
      release_year: f.release_year, release_year_ec: f.release_year_ec,
      type: f.type, format: f.format, catalog_number: f.catalog_number,
      label: { name_en: f.label_en, name_am: f.label_am },
      artists, youtube_video_id: vid ?? "", streaming_links: built.links, notes: f.notes,
      credits: toCredits(credits),
      tracks: tracks.filter((t) => t.title_en.trim() || t.title_am.trim()).map((t) => ({
        title_en: t.title_en.trim() || t.title_am.trim(), title_am: t.title_am.trim(),
        side: t.side, duration_seconds: toSeconds(t.duration), credits: toCredits(t.credits),
        performers: parsePeople(t.performers), featured: parsePeople(t.featured),
      })),
    };

    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_release", { payload });
    if (error) { setBusy(false); return setErr(friendlyDbError(error)); }

    // Staff link the new release straight away; anyone else leaves a request for moderators.
    if (editionOf) {
      const { error: linkErr } = staff
        ? await supabase.rpc("link_release_edition", { p_edition: data, p_main: editionOf.id })
        : await supabase.from("edit_proposals").insert({
            target_table: "releases", target_id: data, proposed_changes: { edition_of: editionOf.id },
            submitter_notes: `Please link as an edition of “${editionOf.title_en}”.`,
          });
      if (linkErr) {
        await refreshRecords([{ kind: "release", id: String(data) }]).catch(() => {});
        setBusy(false);
        setCreated(String(data));
        return setErr(`The release was added, but ${staff ? "linking it as an edition" : "the request to link it as an edition"} failed: ${friendlyDbError(linkErr)}`);
      }
    }
    // new pages: the release, its artists, label and main release; plus the home page and lists
    await refreshRecords([{ kind: "release", id: String(data) }]).catch(() => {});
    setBusy(false);
    router.push(`/releases/${data}`);
  }

  // ---------- Step 1: does it already exist? ----------
  if (stage === "check") {
    return (
      <form onSubmit={check} className="max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">Step 1 of 2: check whether the release is already in the database.</p>
        <Field label="Release title (English) *"><input className={inp} aria-label="Release title (English)" maxLength={MAX.title} {...bind("title_en")} /></Field>
        <Field label="Release artists *" group><ArtistInput className={inp} value={f.artists} onChange={(v) => setF((p) => ({ ...p, artists: v }))} /></Field>
        {!matches && <ExistingReleases title={f.title_en} artists={f.artists} />}
        {matches && <Matches items={matches} onContinue={proceed} onEdition={addAsEdition} />}
        {err && <p className="text-sm text-danger">{err}</p>}
        <button disabled={busy} className="rounded bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-60">
          {busy ? "Checking…" : "Check & continue"}
        </button>
      </form>
    );
  }

  const enteredTracks = tracks.filter(hasContent).length;
  const linkPanel = (
    <div className="space-y-3">
      <ImportFromLink artists={parsePeople(f.artists).map((p) => p.name_en)} onFill={fillFromLink} />
      {linkNote && <p className="text-xs text-muted-foreground">{linkNote}</p>}
      {amSuggestion && (
        <p className="text-xs">
          Amharic title from the link: <span className="font-medium">{amSuggestion}</span>{" "}
          <button type="button" className="underline" onClick={() => { setF((p) => ({ ...p, title_am: amSuggestion })); setAmSuggestion(null); }}>
            Use it
          </button>
        </p>
      )}
      {pendingTracks && (
        <div className="space-y-2 rounded border border-warn p-3 text-sm">
          <p>Replace the {enteredTracks} track{enteredTracks === 1 ? "" : "s"} you entered with the {pendingTracks.length} from the link?</p>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-3 py-1 hover:bg-muted" onClick={() => { setTracks(pendingTracks); setPendingTracks(null); }}>Replace</button>
            <button type="button" className="rounded border px-3 py-1 hover:bg-muted" onClick={() => setPendingTracks(null)}>Keep mine</button>
          </div>
        </div>
      )}
    </div>
  );

  // ---------- Step 2: full form, with three ways to fill it beside it ----------
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <form onSubmit={submit} className="min-w-0 space-y-8">
        <datalist id="roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
        {editionOf ? (
          <p className="rounded border border-warn px-3 py-2 text-sm">
            Step 2 of 2: adding another edition of{" "}
            <Link href={`/releases/${editionOf.id}`} target="_blank" className="font-medium underline">{editionOf.title_en}</Link>.{" "}
            {staff ? "It will be linked to it when you submit." : "Moderators will be asked to link it when you submit."}{" "}
            <button type="button" onClick={() => setEditionOf(null)} className="text-xs text-muted-foreground underline">Add it as a separate release instead</button>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Step 2 of 2: this release isn&apos;t in the database yet. Add the details.</p>
        )}

        <section className="space-y-3">
          <h2 className="dg-h">Release</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title (English) *"><input className={inp} aria-label="Release title (English)" maxLength={MAX.title} {...bind("title_en")} /></Field>
            <Field label="Title (Amharic)"><input className={inp} aria-label="Release title (Amharic)" maxLength={MAX.title} {...bind("title_am")} /></Field>
            <Field label="Year"><input className={inp} aria-label="Release year" inputMode="numeric" {...bind("release_year")} /></Field>
            <Field label="Year, Ethiopian calendar (optional)"><input className={inp} aria-label="Release year (Ethiopian calendar)" inputMode="numeric" {...bind("release_year_ec")} /></Field>
            <Field label="Type"><select className={inp} aria-label="Release type" {...bind("type")}>{["Album", "Single", "EP", "Compilation"].map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Format"><select className={inp} aria-label="Format" {...bind("format")}>{["Cassette", "Vinyl", "CD", "Digital", "Other"].map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Label (English)"><input className={inp} aria-label="Label (English)" maxLength={MAX.name} {...bind("label_en")} /></Field>
            <Field label="Label (Amharic)"><input className={inp} aria-label="Label (Amharic)" maxLength={MAX.name} {...bind("label_am")} /></Field>
            <Field label="Catalog number"><input className={inp} aria-label="Catalog number" maxLength={MAX.catalog} {...bind("catalog_number")} /></Field>
          </div>
          <Field label="Release artists *" group><ArtistInput className={inp} value={f.artists} onChange={(v) => setF((p) => ({ ...p, artists: v }))} /></Field>
          {!editionOf && !matches && <ExistingReleases title={f.title_en} artists={f.artists} />}
        </section>

        <section className="space-y-3">
          <h2 className="dg-h">Cover image</h2>
          <div className="flex items-start gap-3">
            {vid && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`https://img.youtube.com/vi/${vid}/hqdefault.jpg`} alt="Cover preview" className="h-20 w-20 rounded object-cover" />
            )}
            <Field label="YouTube video link" hint="Its thumbnail is used as the cover." className="w-full">
              <input className={inp} type="url" inputMode="url" {...bind("video_url")} />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="dg-h">Listen</h2>
          <ListenLinksEditor rows={linkRows} onChange={setLinkRows} />
        </section>

        <section className="space-y-3">
          <h2 className="dg-h">Tracklist</h2>
          {tracks.map((t, i) => (
            <div key={i} className="space-y-2 rounded border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Track {i + 1}</p>
                <button type="button" onClick={() => setTracks((ts) => ts.filter((_, j) => j !== i))} aria-label={`Remove track ${i + 1}`}><RemoveIcon /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_60px_80px]">
                <Field label="Title (English)" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Track ${i + 1} title (English)`} maxLength={MAX.title} value={t.title_en} onChange={(e) => updTrack(i, { title_en: e.target.value })} /></Field>
                <Field label="Title (Amharic)" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Track ${i + 1} title (Amharic)`} maxLength={MAX.title} value={t.title_am} onChange={(e) => updTrack(i, { title_am: e.target.value })} /></Field>
                <Field label="Side"><input className={inp} aria-label={`Track ${i + 1} side`} maxLength={1} value={t.side} onChange={(e) => updTrack(i, { side: e.target.value })} /></Field>
                <Field label="Length"><input className={inp} aria-label={`Track ${i + 1} duration (m:ss)`} placeholder="m:ss" value={t.duration} onChange={(e) => updTrack(i, { duration: e.target.value })} /></Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Performers (if not the release artists)" group><ArtistInput className={inp} ariaLabel={`Track ${i + 1} performers`} value={t.performers} onChange={(v) => updTrack(i, { performers: v })} /></Field>
                <Field label="Featured artists" group><ArtistInput className={inp} ariaLabel={`Track ${i + 1} featured artists`} value={t.featured} onChange={(v) => updTrack(i, { featured: v })} /></Field>
              </div>
            <CreditsEditor rows={t.credits} onChange={(c) => updTrack(i, { credits: c })} />
            </div>
          ))}
          <button type="button" className="text-sm underline" onClick={() => setTracks((ts) => [...ts, emptyTrack()])}>+ Add track</button>
        </section>

        <section className="space-y-3">
          <h2 className="dg-h">Album credits</h2>
          <CreditsEditor rows={credits} onChange={setCredits} />
          <p className="text-xs text-muted-foreground">
            Unknown roles are added as custom roles for moderators to review.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="dg-h">Other notes</h2>
          <textarea className={inp} rows={3} aria-label="Other notes" maxLength={MAX.notes} {...bind("notes")} />
        </section>

        {matches && <Matches items={matches} onContinue={proceed} onEdition={addAsEdition} />}
        {err && <p className="text-sm text-danger">{err}</p>}
        {created && <p className="text-sm"><Link href={`/releases/${created}`} className="underline">Open the new release</Link></p>}
        <button disabled={busy || !!created} className="rounded bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-60">
          {busy ? "Working…" : "Submit release"}
        </button>
      </form>

      {/* first on small screens, beside the form on large ones; switching tabs never clears anything */}
      <aside className="order-first self-start lg:order-none lg:sticky lg:top-4">
        <Tabs
          label="Ways to fill in the details"
          tabs={[
            {
              id: "type", title: "Type it in",
              content: (
                <p className="text-sm text-muted-foreground">
                  Fill in the form. You can switch to scanning liner notes or filling from a link at any time; neither
                  clears what you have entered.
                </p>
              ),
            },
            { id: "scan", title: "Scan liner notes", content: <LinerScanner /> },
            { id: "link", title: "Fill from a link", content: linkPanel },
          ]}
        />
      </aside>
    </div>
  );
}
