"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/field";
import { KIND_OF } from "@/lib/cache-tags";
import { friendlyDbError, MAX, MEMBER_EDIT_ERROR, NOTHING_CHANGED, parsePeople } from "@/lib/form-utils";
import { refreshRecords } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/client";

export type Entity = {
  id: string; name_en: string; name_am: string | null; sort_name?: string | null; entity_type?: string;
  bio_en?: string | null; bio_am?: string | null; begin_year?: number | null; end_year?: number | null;
};
const inp = "w-full rounded border bg-background px-2 py-1.5 text-sm";
const num = (s: string) => (s.trim() ? Number(s) : null);
const txt = (s: string) => (s.trim() ? s.trim() : null);

function aliasList(s: string) {
  const out: string[] = [];
  for (const a of s.split("\n").map((x) => x.trim())) if (a && !out.some((o) => o.toLowerCase() === a.toLowerCase())) out.push(a);
  return out;
}
const contentKey = (aliases: string, members: string) =>
  JSON.stringify({
    a: aliasList(aliases).map((x) => x.toLowerCase()).sort(),
    m: parsePeople(members).map((p) => p.name_en.toLowerCase()).sort(),
  });

export function EntityEditForm({
  table, entity: e, direct, initialAliases, initialMembers,
}: { table: "artists" | "labels"; entity: Entity; direct: boolean; initialAliases: string; initialMembers: string }) {
  const router = useRouter();
  const isArtist = table === "artists";
  const [f, setF] = useState({
    name_en: e.name_en, name_am: e.name_am ?? "", sort_name: e.sort_name ?? "", entity_type: e.entity_type ?? "Person",
    bio_en: e.bio_en ?? "", bio_am: e.bio_am ?? "", begin_year: e.begin_year?.toString() ?? "", end_year: e.end_year?.toString() ?? "",
    aliases: initialAliases, members: initialMembers,
  });
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: ev.target.value })),
  });
  const fail = (m: string) => { setBusy(false); setErr(m); };
  const isGroup = f.entity_type === "Group";

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    setMemberErr(null);
    if (!f.name_en.trim()) return setErr("English name is required.");
    if (isArtist && (!/^\d{0,4}$/.test(f.begin_year.trim()) || !/^\d{0,4}$/.test(f.end_year.trim()))) return setErr("Years must be numbers.");

    const next: Record<string, unknown> = { name_en: f.name_en.trim(), name_am: txt(f.name_am) };
    const old: Record<string, unknown> = { name_en: e.name_en, name_am: e.name_am };
    if (isArtist) {
      Object.assign(next, {
        sort_name: txt(f.sort_name), entity_type: f.entity_type, bio_en: txt(f.bio_en), bio_am: txt(f.bio_am),
        begin_year: num(f.begin_year), end_year: num(f.end_year),
      });
      Object.assign(old, {
        sort_name: e.sort_name ?? null, entity_type: e.entity_type, bio_en: e.bio_en ?? null, bio_am: e.bio_am ?? null,
        begin_year: e.begin_year ?? null, end_year: e.end_year ?? null,
      });
    }
    const diff = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== old[k]));
    const hasScalar = Object.keys(diff).length > 0;
    const contentChanged =
      isArtist && contentKey(f.aliases, isGroup ? f.members : "") !== contentKey(initialAliases, e.entity_type === "Group" ? initialMembers : "");
    if (!hasScalar && !contentChanged) return setErr("You haven't changed anything.");
    const content = { aliases: aliasList(f.aliases), members: isGroup ? parsePeople(f.members) : [] };

    setBusy(true);
    const supabase = createClient();
    if (direct) {
      if (hasScalar) {
        const { data, error } = await supabase.from(table).update(diff).eq("id", e.id).select("id");
        if (error) return fail(friendlyDbError(error));
        if (!data?.length) return fail(NOTHING_CHANGED);
      }
      if (contentChanged) {
        const { error } = await supabase.rpc("replace_artist_content", { p_artist: e.id, p_content: content });
        if (error) {
          // the fields above may already be saved
          if (hasScalar) await refreshRecords([{ kind: KIND_OF[table], id: e.id }]).catch(() => {});
          const message = friendlyDbError(error);
          // shown under the Members field; everything typed stays in the form
          if (message !== MEMBER_EDIT_ERROR) return fail(message);
          setMemberErr(message);
          return fail("The aliases and members were not saved. See the Members field.");
        }
      }
      await refreshRecords([{ kind: KIND_OF[table], id: e.id }]).catch(() => {});
      router.push(`/${table}/${e.id}`);
      router.refresh();
    } else {
      const note = reason.trim() || null;
      const rows = [
        ...(hasScalar ? [{ target_table: table, target_id: e.id, proposed_changes: diff, submitter_notes: note }] : []),
        ...(contentChanged ? [{ target_table: "artist_content", target_id: e.id, proposed_changes: content, submitter_notes: note }] : []),
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
        <Link href={`/${table}/${e.id}`} className="underline">Back</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <p className="rounded border p-3 text-sm text-muted-foreground">
        {direct
          ? "You can edit this record directly, so your changes apply immediately."
          : "This record was added by someone else (or is locked), so your changes will be reviewed by a moderator before they go live."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (English) *"><input className={inp} aria-label="Name (English)" maxLength={MAX.name} {...bind("name_en")} /></Field>
        <Field label="Name (Amharic)"><input className={inp} aria-label="Name (Amharic)" maxLength={MAX.name} {...bind("name_am")} /></Field>
        {isArtist && (
          <>
            <Field label="Sort name (surname first)"><input className={inp} aria-label="Sort name" maxLength={MAX.name} {...bind("sort_name")} /></Field>
            <Field label="Type"><select className={inp} aria-label="Type" {...bind("entity_type")}>{["Person", "Group", "Organization"].map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Born / formed (year)"><input className={inp} aria-label="Born or formed (year)" inputMode="numeric" {...bind("begin_year")} /></Field>
            <Field label="Died / dissolved (year)"><input className={inp} aria-label="Died or dissolved (year)" inputMode="numeric" {...bind("end_year")} /></Field>
          </>
        )}
      </div>
      {isArtist && (
        <>
          <Field label="Biography (English)"><textarea className={inp} rows={3} aria-label="Biography (English)" maxLength={MAX.bio} {...bind("bio_en")} /></Field>
          <Field label="Biography (Amharic)"><textarea className={inp} rows={3} aria-label="Biography (Amharic)" maxLength={MAX.bio} {...bind("bio_am")} /></Field>
          <Field label="Aliases and other spellings (one per line)"><textarea className={inp} rows={3} aria-label="Aliases and other spellings, one per line" {...bind("aliases")} /></Field>
          {isGroup && (
            <Field label="Members">
              <input className={inp} aria-label="Members, comma separated" aria-invalid={!!memberErr}
                aria-describedby={memberErr ? "members-error" : undefined} {...bind("members")} />
              {memberErr && <span id="members-error" role="alert" className="mt-1 block text-sm text-danger">{memberErr}</span>}
            </Field>
          )}
        </>
      )}
      {!direct && (
        <Field label="Why this change? (your source)">
          <textarea className={inp} rows={2} aria-label="Reason for the change" maxLength={MAX.reason} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
      <button disabled={busy} className="rounded bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-60">
        {busy ? "Saving…" : direct ? "Save changes" : "Submit for review"}
      </button>
    </form>
  );
}
