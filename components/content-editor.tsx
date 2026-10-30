"use client";

import { MAX } from "@/lib/form-utils";
import type { CreditRow, EditorState, TrackRow } from "@/lib/release-content";
import { DownIcon, RemoveIcon, UpIcon } from "@/components/icons";
import { Field } from "@/components/field";

const inp = "w-full rounded border bg-background px-2 py-1.5 text-sm";
const blankCredit = (): CreditRow => ({ role: "", names: "", note: "", credited_as: "" });
const blankTrack = (): TrackRow => ({ title_en: "", title_am: "", side: "", duration: "", performers: "", featured: "", credits: [] });

function Credits({ rows, onChange }: { rows: CreditRow[]; onChange: (r: CreditRow[]) => void }) {
  const upd = (i: number, patch: Partial<CreditRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch, ...(patch.names !== undefined ? { credited_as: "" } : {}) } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[140px_1fr_170px_auto]">
          <Field label="Role"><input list="roles" className={inp} aria-label={`Credit ${i + 1} role`} maxLength={MAX.role} value={r.role} onChange={(e) => upd(i, { role: e.target.value })} /></Field>
          <Field label="Names" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Credit ${i + 1} names`} value={r.names}
            title={r.credited_as ? `Credited as "${r.credited_as}"` : undefined} onChange={(e) => upd(i, { names: e.target.value })} /></Field>
          <Field label="Note" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Credit ${i + 1} note`} maxLength={MAX.creditNote} value={r.note} onChange={(e) => upd(i, { note: e.target.value })} /></Field>
          <button type="button" className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto justify-self-start py-2" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove credit"><RemoveIcon /></button>
        </div>
      ))}
      <button type="button" className="text-sm underline" onClick={() => onChange([...rows, blankCredit()])}>+ Add credit</button>
    </div>
  );
}

export function ContentEditor({ value, onChange, roles }: { value: EditorState; onChange: (v: EditorState) => void; roles: string[] }) {
  const set = (patch: Partial<EditorState>) => onChange({ ...value, ...patch });
  const updTrack = (i: number, patch: Partial<TrackRow>) => set({ tracks: value.tracks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const move = (i: number, d: number) => {
    const ts = [...value.tracks];
    const j = i + d;
    if (j < 0 || j >= ts.length) return;
    [ts[i], ts[j]] = [ts[j], ts[i]];
    set({ tracks: ts });
  };

  return (
    <div className="space-y-8">
      <datalist id="roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>

      <section className="space-y-3">
        <h2 className="dg-h">Release artists</h2>
        <Field label="Release artists *"><input className={inp} aria-label="Release artists" value={value.artists} onChange={(e) => set({ artists: e.target.value })} /></Field>
      </section>

      <section className="space-y-3">
        <h2 className="dg-h">Tracklist</h2>
        {value.tracks.map((t, i) => (
          <div key={t.id ?? `new-${i}`} className="space-y-2 rounded border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Track {i + 1}</p>
              <span className="flex gap-2">
                <button type="button" onClick={() => move(i, -1)} aria-label={`Move track ${i + 1} up`}><UpIcon /></button>
                <button type="button" onClick={() => move(i, 1)} aria-label={`Move track ${i + 1} down`}><DownIcon /></button>
                <button type="button" onClick={() => set({ tracks: value.tracks.filter((_, j) => j !== i) })} aria-label={`Remove track ${i + 1}`}><RemoveIcon /></button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_60px_80px]">
              <Field label="Title (English)" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Track ${i + 1} title (English)`} maxLength={MAX.title} value={t.title_en} onChange={(e) => updTrack(i, { title_en: e.target.value })} /></Field>
              <Field label="Title (Amharic)" className="col-span-2 sm:col-span-1"><input className={inp} aria-label={`Track ${i + 1} title (Amharic)`} maxLength={MAX.title} value={t.title_am} onChange={(e) => updTrack(i, { title_am: e.target.value })} /></Field>
              <Field label="Side"><input className={inp} aria-label={`Track ${i + 1} side`} maxLength={1} value={t.side} onChange={(e) => updTrack(i, { side: e.target.value })} /></Field>
              <Field label="Length"><input className={inp} aria-label={`Track ${i + 1} duration (m:ss)`} placeholder="m:ss" value={t.duration} onChange={(e) => updTrack(i, { duration: e.target.value })} /></Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Performers (if not the release artists)"><input className={inp} aria-label={`Track ${i + 1} performers`} value={t.performers} onChange={(e) => updTrack(i, { performers: e.target.value })} /></Field>
              <Field label="Featured artists"><input className={inp} aria-label={`Track ${i + 1} featured artists`} value={t.featured} onChange={(e) => updTrack(i, { featured: e.target.value })} /></Field>
            </div>
            <Credits rows={t.credits} onChange={(c) => updTrack(i, { credits: c })} />
          </div>
        ))}
        <button type="button" className="text-sm underline" onClick={() => set({ tracks: [...value.tracks, blankTrack()] })}>+ Add track</button>
      </section>

      <section className="space-y-3">
        <h2 className="dg-h">Album credits</h2>
        <Credits rows={value.credits} onChange={(c) => set({ credits: c })} />
      </section>
    </div>
  );
}
