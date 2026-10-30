import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArtistMerge } from "@/components/artist-merge";
import { ProposalActions, RoleActions } from "@/components/moderation-actions";
import { StaffManager } from "@/components/staff-manager";
import { ListSkeleton } from "@/components/page-skeleton";
import type { RecordKind } from "@/lib/cache-tags";
import { RELEASE_CONTENT_SELECT, describeContent, releaseArtistIds, releaseToState, stateToContent, type ContentPayload, type DbRelease } from "@/lib/release-content";
import { describeLinks } from "@/lib/streaming-links";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation", description: "Review edit proposals and custom credit roles.", robots: { index: false } };

type Proposal = {
  id: string; target_table: string; target_id: string; proposed_changes: Record<string, unknown>;
  submitter_notes: string | null; created_at: string; profiles: { username: string | null } | null;
};
type Role = { id: string; role_en: string };
type Row = Record<string, unknown>;

const empty = Promise.resolve({ data: [] as unknown[] });
const KIND: Record<string, string> = {
  releases: "Release fields", release_content: "Tracklist & credits", artists: "Artist fields",
  artist_content: "Aliases & members", labels: "Label fields",
};
// the record whose cached pages an approval refreshes
const TARGET: Record<string, RecordKind> = {
  releases: "release", release_content: "release", artists: "artist", artist_content: "artist", labels: "label",
};
const PATH: Record<string, string> = {
  releases: "releases", release_content: "releases", artists: "artists", artist_content: "artists", labels: "labels",
};

// one field of a "Release fields" proposal; streaming links are an object, so list them one per line
function fieldText(k: string, v: unknown): string {
  if (k === "streaming_links") return describeLinks(v).join("\n") || "(none)";
  return String(v ?? "(none)");
}

function DiffLines({ before, after }: { before: string[]; after: string[] }) {
  const b = new Set(before), a = new Set(after);
  const removed = before.filter((l) => !a.has(l)), added = after.filter((l) => !b.has(l));
  return (
    <div className="space-y-1 text-sm">
      {removed.map((l, i) => <p key={`r${i}`} className="text-danger">− {l}</p>)}
      {added.map((l, i) => <p key={`a${i}`} className="text-ok">+ {l}</p>)}
      {!removed.length && !added.length && <p className="text-muted-foreground">No visible changes.</p>}
    </div>
  );
}

async function ModerationContent() {
  // Request-time only: the session check reads the clock, which Next forbids while pre-rendering (partialPrefetching)
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (prof as { role: string } | null)?.role;
  if (role !== "admin" && role !== "moderator") notFound();

  const [props, custom, official] = await Promise.all([
    supabase.from("edit_proposals")
      .select("id,target_table,target_id,proposed_changes,submitter_notes,created_at,profiles!edit_proposals_submitted_by_fkey(username)")
      .eq("status", "pending").order("created_at"),
    supabase.from("credit_roles").select("id,role_en").eq("is_custom", true).order("created_at"),
    supabase.from("credit_roles").select("id,role_en").eq("is_custom", false).order("role_en"),
  ]);
  const pending = (props.data ?? []) as unknown as Proposal[];
  const customRoles = (custom.data ?? []) as unknown as Role[];
  const officials = (official.data ?? []) as unknown as Role[];
  const staff = role === "admin"
    ? (((await supabase.from("profiles").select("id,username,role").in("role", ["admin", "moderator"]).order("role")).data ?? []) as unknown as { id: string; username: string | null; role: string }[])
    : [];

  const idsOf = (kinds: string[]) => [...new Set(pending.filter((p) => kinds.includes(p.target_table)).map((p) => p.target_id))];
  // a contributor's request to link a new release as an edition of another (see ReleaseForm)
  const editionMain = (p: Proposal) =>
    p.target_table === "releases" && typeof p.proposed_changes.edition_of === "string" ? p.proposed_changes.edition_of : null;
  const mainIds = pending.map(editionMain).filter((m): m is string => !!m);
  const relIds = [...new Set([...idsOf(["releases", "release_content"]), ...mainIds])], artIds = idsOf(["artists", "artist_content"]), labIds = idsOf(["labels"]);
  const [relRes, artRes, labRes, memRes] = await Promise.all([
    relIds.length ? supabase.from("releases").select(RELEASE_CONTENT_SELECT).in("id", relIds) : empty,
    artIds.length
      ? supabase.from("artists").select("id,name_en,name_am,sort_name,entity_type,bio_en,bio_am,begin_year,end_year,artist_aliases(alias)").in("id", artIds)
      : empty,
    labIds.length ? supabase.from("labels").select("id,name_en,name_am").in("id", labIds) : empty,
    artIds.length
      ? supabase.from("group_members").select("group_id, member:artists!group_members_member_id_fkey(name_en,name_am)").in("group_id", artIds)
      : empty,
  ]);

  const ents = new Map<string, Row>();
  for (const r of [...(relRes.data ?? []), ...(artRes.data ?? []), ...(labRes.data ?? [])] as unknown as (Row & { id: string })[]) ents.set(r.id, r);
  const members = new Map<string, string[]>();
  for (const m of (memRes.data ?? []) as unknown as { group_id: string; member: { name_en: string } }[])
    members.set(m.group_id, [...(members.get(m.group_id) ?? []), m.member.name_en]);

  function body(p: Proposal, ent: Row | undefined): React.ReactNode {
    const main = editionMain(p);
    if (main) {
      return (
        <p className="text-sm">
          Link as an edition of{" "}
          <Link href={`/releases/${main}`} className="underline">{String(ents.get(main)?.title_en ?? main)}</Link>
        </p>
      );
    }
    if (p.target_table === "release_content" && ent) {
      const before = describeContent(stateToContent(releaseToState(ent as unknown as DbRelease)));
      return <DiffLines before={before} after={describeContent(p.proposed_changes as unknown as ContentPayload)} />;
    }
    if (p.target_table === "artist_content" && ent) {
      const c = p.proposed_changes as unknown as { aliases?: string[]; members?: { name_en: string }[] };
      const before = [
        ...((ent.artist_aliases as { alias: string }[] | undefined) ?? []).map((x) => `Alias: ${x.alias}`),
        ...(members.get(String(ent.id)) ?? []).map((m) => `Member: ${m}`),
      ];
      const after = [...(c.aliases ?? []).map((a) => `Alias: ${a}`), ...(c.members ?? []).map((m) => `Member: ${m.name_en}`)];
      return <DiffLines before={before} after={after} />;
    }
    return (
      <div className="overflow-x-auto">
        <table className="text-sm">
          <tbody>
            {Object.entries(p.proposed_changes).map(([k, v]) => (
              <tr key={k}>
                <td className="pr-4 text-muted-foreground">{k}</td>
                <td className="whitespace-pre-line pr-2 text-danger line-through">{fieldText(k, ent?.[k])}</td>
                <td className="whitespace-pre-line text-ok">{fieldText(k, v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <h1 className="text-2xl font-bold">Moderation</h1>

      <section>
        <h2 className="dg-h">Pending edit proposals ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>}
        <div className="space-y-4">
          {pending.map((p) => {
            const ent = ents.get(p.target_id);
            const main = editionMain(p);
            const name = String(ent?.name_en ?? ent?.title_en ?? p.target_id);
            return (
              <article key={p.id} className="rounded border p-4">
                <p className="text-sm">
                  <span className="font-medium">{KIND[p.target_table] ?? p.target_table}</span>
                  {" for "}
                  {ent ? <Link href={`/${PATH[p.target_table]}/${p.target_id}`} className="underline">{name}</Link> : name}
                  <span className="text-muted-foreground"> · by {p.profiles?.username ?? "unknown"} · {new Date(p.created_at).toLocaleDateString()}</span>
                </p>
                {p.submitter_notes && <p className="mt-1 text-sm italic text-muted-foreground">“{p.submitter_notes}”</p>}
                <div className="mt-3">{body(p, ent)}</div>
                <ProposalActions
                  id={p.id}
                  target={TARGET[p.target_table] ? { kind: TARGET[p.target_table], id: p.target_id } : undefined}
                  artists={TARGET[p.target_table] === "release" && ent ? releaseArtistIds(ent as unknown as DbRelease) : []}
                  edition={main ? { id: p.target_id, main } : undefined}
                />
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="dg-h">Custom credit roles ({customRoles.length})</h2>
        {customRoles.length === 0 && <p className="text-sm text-muted-foreground">No custom roles to review.</p>}
        <ul className="space-y-3">
          {customRoles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">{r.role_en}</span>
              <RoleActions id={r.id} officials={officials} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="dg-h">Merge duplicate artists</h2>
        <ArtistMerge />
      </section>

      {role === "admin" && (
        <section>
          <h2 className="dg-h">Staff</h2>
          <StaffManager staff={staff} me={user.id} />
        </section>
      )}
    </div>
  );
}

export default function ModerationPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ModerationContent />
    </Suspense>
  );
}
