import { notFound, redirect } from "next/navigation";
import { EntityEditForm, type Entity } from "@/components/entity-edit-form";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function EntityEditPage({ table, id }: { table: "artists" | "labels"; id: string }) {
  // Request-time only: the session check reads the clock, which Next forbids while pre-rendering (partialPrefetching)
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const isArtist = table === "artists";
  const select = isArtist
    ? "id,name_en,name_am,sort_name,entity_type,bio_en,bio_am,begin_year,end_year,created_by,is_locked,artist_aliases(alias)"
    : "id,name_en,name_am,created_by,is_locked";
  const [ent, prof, mem] = await Promise.all([
    supabase.from(table).select(select).eq("id", id).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    isArtist
      ? supabase.from("group_members").select("member:artists!group_members_member_id_fkey(name_en,name_am)").eq("group_id", id)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  if (!ent.data) notFound();
  const e = ent.data as unknown as Entity & { created_by: string | null; is_locked: boolean; artist_aliases?: { alias: string }[] };
  const role = (prof.data as unknown as { role: string } | null)?.role;
  const direct = role === "admin" || role === "moderator" || (e.created_by === user.id && !e.is_locked);

  const members = ((mem.data ?? []) as unknown as { member: { name_en: string; name_am: string | null } }[])
    .map(({ member: m }) => (m.name_am && m.name_am !== m.name_en ? `${m.name_en} / ${m.name_am}` : m.name_en))
    .join(", ");
  const aliases = (e.artist_aliases ?? []).map((a) => a.alias).join("\n");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Edit “{e.name_en}”</h1>
      <EntityEditForm table={table} entity={e} direct={direct} initialAliases={aliases} initialMembers={members} />
    </div>
  );
}
