import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { FormSkeleton } from "@/components/page-skeleton";
import { ReleaseEditForm, type EditableRelease } from "@/components/release-edit-form";
import { RELEASE_CONTENT_SELECT, releaseArtistIds, releaseToState, type DbRelease } from "@/lib/release-content";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit release", description: "Edit a release or suggest changes.", robots: { index: false } };

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Request-time only: the session check reads the clock, which Next forbids while pre-rendering (partialPrefetching)
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [rel, prof, roleRows] = await Promise.all([
    supabase.from("releases").select(RELEASE_CONTENT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("credit_roles").select("role_en").order("role_en"),
  ]);
  if (!rel.data) notFound();
  const r = rel.data as unknown as EditableRelease & DbRelease & { created_by: string | null; is_locked: boolean };
  const role = (prof.data as unknown as { role: string } | null)?.role ?? "user";
  const direct = role === "admin" || role === "moderator" || (r.created_by === user.id && !r.is_locked);
  const roles = ((roleRows.data ?? []) as unknown as { role_en: string }[]).map((x) => x.role_en);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Edit “{r.title_en}”</h1>
      <ReleaseEditForm release={r} direct={direct} initial={releaseToState(r)} roles={roles} artistIds={releaseArtistIds(r)} />
    </div>
  );
}

export default function EditReleasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <EditContent params={params} />
    </Suspense>
  );
}
