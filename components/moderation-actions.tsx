"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendlyDbError, MAX, NOTHING_CHANGED } from "@/lib/form-utils";
import { refreshRecords, type RefreshTarget } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/client";

const btn = "rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50";

// `edition` is set for a contributor's request to link a new release as an edition: apply_edit_proposal
// can't set edition_of, so approving calls link_release_edition and then marks the proposal approved.
// `target` is the record an approval changes; its cached pages are refreshed, plus `artists` (a release's artists
// before the change). Rejecting changes no public page.
export function ProposalActions({ id, target, artists = [], edition }: {
  id: string; target?: RefreshTarget; artists?: string[]; edition?: { id: string; main: string };
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: "apply_edit_proposal" | "reject_edit_proposal") {
    setBusy(true);
    setErr(null);
    const { error } = await createClient().rpc(fn, { p_id: id, p_notes: note.trim() || null });
    if (error) {
      setBusy(false);
      return setErr(friendlyDbError(error));
    }
    if (fn === "apply_edit_proposal" && target) await refreshRecords([target], artists).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  async function linkAndApprove(ed: { id: string; main: string }) {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("link_release_edition", { p_edition: ed.id, p_main: ed.main });
    if (error) {
      setBusy(false);
      return setErr(friendlyDbError(error));
    }
    const { data: rel } = await supabase.from("releases").select("edition_of").eq("id", ed.id).maybeSingle();
    if ((rel as { edition_of: string | null } | null)?.edition_of !== ed.main) {
      setBusy(false);
      return setErr(NOTHING_CHANGED);
    }
    const { data, error: upErr } = await supabase.from("edit_proposals")
      .update({ status: "approved", admin_notes: note.trim() || null }).eq("id", id).select("id");
    // the link is already made, so refresh even if marking the proposal failed
    await refreshRecords([{ kind: "release", id: ed.id }, { kind: "release", id: ed.main }]).catch(() => {});
    setBusy(false);
    if (upErr) return setErr(friendlyDbError(upErr));
    if (!data?.length) return setErr(NOTHING_CHANGED);
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the contributor" maxLength={MAX.reason} placeholder="Note to the contributor (optional)" className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
      <div className="flex gap-2">
        {edition ? (
          <button disabled={busy} onClick={() => linkAndApprove(edition)} className={btn}>Link as edition &amp; approve</button>
        ) : (
          <button disabled={busy} onClick={() => act("apply_edit_proposal")} className={btn}>Approve &amp; apply</button>
        )}
        <button disabled={busy} onClick={() => act("reject_edit_proposal")} className={btn}>Reject</button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}

// Making a role official or merging it changes role pages and the credit lines on release pages
export function RoleActions({ id, officials }: { id: string; officials: { id: string; role_en: string }[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // expectRows: the call is a table write with .select(), so an empty result means RLS changed nothing
  async function run(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, refresh: RefreshTarget[], expectRows = false) {
    setBusy(true);
    setErr(null);
    const { data, error } = await p;
    if (error || (expectRows && !(Array.isArray(data) && data.length))) {
      setBusy(false);
      return setErr(error ? friendlyDbError(error) : NOTHING_CHANGED);
    }
    await refreshRecords(refresh).catch(() => {});
    setBusy(false);
    router.refresh();
  }
  const supabase = createClient();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={busy} className={btn} onClick={() => run(supabase.from("credit_roles").update({ is_custom: false }).eq("id", id).select("id"), [{ kind: "role", id }], true)}>
        Make official
      </button>
      <select aria-label="Merge into role" value={target} onChange={(e) => setTarget(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm">
        <option value="">Merge into…</option>
        {officials.map((o) => <option key={o.id} value={o.id}>{o.role_en}</option>)}
      </select>
      <button disabled={busy || !target} className={btn} onClick={() => run(supabase.rpc("merge_credit_role", { p_source: id, p_target: target }), [{ kind: "role", id }, { kind: "role", id: target }])}>
        Merge
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
