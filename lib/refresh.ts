"use server";

import { updateTag } from "next/cache";
import { ALL_TAG, LISTS_TAG, recordTag, ROLES_TAG, UUID_RE, type RecordKind } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

// Called from the browser after a successful save, delete, lock, edition link/unlink, proposal approval or merge
// (the writes themselves go straight to Supabase, so the server can't see them). Expires the cached pages of the
// changed records, of the records they now point to, and the home page and browse lists.
// Pages that showed the record before the change carry its tag already (see lib/cache-tags.ts).
// It only expires caches, never reads or returns private data.

export type RefreshTarget = { kind: RecordKind; id: string };

const TABLE: Record<RecordKind, string> = { release: "releases", artist: "artists", label: "labels", role: "credit_roles" };
const MAX_TAGS = 400;
const MAX_PREVIOUS = 300;
const MAX_PREVIOUS_CONTRIBUTOR = 20;

// Non-staff: one call per user every COOLDOWN_MS, and the shared lists/roles tags at most once per BROAD_TAGS_MS.
// In memory, so per server instance (like the import cooldown).
const COOLDOWN_MS = 1500;
const BROAD_TAGS_MS = 60_000;
const lastCall = new Map<string, number>();
const lastBroad = new Map<string, number>();

async function signedInRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { supabase, user, role: (data as { role: string } | null)?.role ?? "user" };
}

/**
 * `previousArtists`: for a release edit, the artists it had before the save (removed ones no longer point to it,
 * and an artist page with more than 127 releases may not carry the release's tag).
 */
export async function refreshRecords(targets: RefreshTarget[], previousArtists: string[] = []): Promise<void> {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 4) return;
  if (!targets.every((t) => t && Object.hasOwn(TABLE, t.kind) && typeof t.id === "string" && UUID_RE.test(t.id))) return;
  if (!Array.isArray(previousArtists) || !previousArtists.every((a) => typeof a === "string" && UUID_RE.test(a))) return;

  const session = await signedInRole();
  if (!session) return;
  const { supabase, user, role } = session;
  let allowed = targets;
  let previous = previousArtists.slice(0, MAX_PREVIOUS);
  let broad = true; // also clear the shared lists and roles tags
  if (role !== "admin" && role !== "moderator") {
    const now = Date.now();
    if (now - (lastCall.get(user.id) ?? 0) < COOLDOWN_MS) return;
    lastCall.set(user.id, now);
    if (lastCall.size > 5000) for (const [id, t] of lastCall) if (now - t > COOLDOWN_MS) lastCall.delete(id);
    // contributors may only refresh records they created (read with their own session)
    const owned = await Promise.all(targets.map(async (t) => {
      const { data } = await supabase.from(TABLE[t.kind]).select("created_by").eq("id", t.id).maybeSingle();
      return (data as { created_by: string | null } | null)?.created_by === user.id;
    }));
    allowed = targets.filter((_, i) => owned[i]);
    if (!allowed.length) return;
    // contributors can't pick many pages to expire, nor clear the shared caches more than once a minute
    previous = [...new Set(previousArtists.map((a) => a.toLowerCase()))].slice(0, MAX_PREVIOUS_CONTRIBUTOR);
    broad = now - (lastBroad.get(user.id) ?? 0) >= BROAD_TAGS_MS;
    if (broad) lastBroad.set(user.id, now);
    if (lastBroad.size > 5000) for (const [id, t] of lastBroad) if (now - t >= BROAD_TAGS_MS) lastBroad.delete(id);
  }

  const releases = allowed.some((t) => t.kind === "release");
  const tags = new Set<string>(allowed.map((t) => recordTag(t.kind, t.id)));
  if (broad) tags.add(LISTS_TAG);
  if (releases) {
    if (broad) tags.add(ROLES_TAG);
    for (const a of previous) tags.add(recordTag("artist", a));
  }
  for (const t of allowed) for (const related of await relatedTags(t)) tags.add(related);
  for (const tag of [...tags].slice(0, MAX_TAGS)) updateTag(tag);
}

/** Admin only: expires every cached read (after changes made outside the app, e.g. in the SQL editor). */
export async function clearAllCaches(): Promise<boolean> {
  const session = await signedInRole();
  if (session?.role !== "admin") return false;
  updateTag(ALL_TAG);
  return true;
}

// Records a target points to after the change, whose pages may not show it yet (e.g. a newly credited artist)
async function relatedTags({ kind, id }: RefreshTarget): Promise<string[]> {
  const db = createPublicClient();
  if (kind === "release") {
    const { data } = await db.from("releases")
      .select("label_id, edition_of, release_artists(artist_id), release_credits(artist_id, role_id), tracks(track_artists(artist_id), track_credits(artist_id, role_id))")
      .eq("id", id).maybeSingle();
    if (!data) return []; // deleted: its own tag covers the pages that showed it
    type Ids = { artist_id: string; role_id?: string };
    const r = data as unknown as {
      label_id: string | null; edition_of: string | null; release_artists: Ids[]; release_credits: Ids[];
      tracks: { track_artists: Ids[]; track_credits: Ids[] }[];
    };
    const main = r.edition_of ?? id;
    const { data: eds } = await db.from("releases").select("id").eq("edition_of", main);
    const people = [...r.release_artists, ...r.release_credits, ...r.tracks.flatMap((t) => [...t.track_artists, ...t.track_credits])];
    return [
      ...(r.label_id ? [recordTag("label", r.label_id)] : []),
      recordTag("release", main),
      ...((eds ?? []) as { id: string }[]).map((e) => recordTag("release", e.id)),
      // each artist's own tag, so its page updates even when it lists more releases than its tags can hold
      ...people.map((p) => recordTag("artist", p.artist_id)),
      ...people.filter((p) => p.role_id).map((p) => recordTag("role", p.role_id!)),
    ];
  }
  if (kind === "artist") {
    // groups and members show each other's names
    const { data } = await db.from("group_members").select("group_id, member_id").or(`group_id.eq.${id},member_id.eq.${id}`);
    return ((data ?? []) as { group_id: string; member_id: string }[])
      .map((m) => recordTag("artist", m.group_id === id ? m.member_id : m.group_id));
  }
  return [];
}
