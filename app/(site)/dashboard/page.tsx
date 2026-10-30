import type { Metadata } from "next";
import Link from "next/link";
import { ClearCachesButton } from "@/components/clear-caches-button";
import { UsernameForm } from "@/components/username-form";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ListSkeleton } from "@/components/page-skeleton";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your dashboard", description: "Your contributions and edit proposals.", robots: { index: false } };

type Item = { id: string; title: string; created_at: string; extra?: string };

function List({ title, items, href }: { title: string; items: Item[]; href?: (i: Item) => string }) {
  return (
    <section>
      <h2 className="dg-h">{title} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 py-2">
              {href ? <Link href={href(i)} className="hover:underline">{i.title}</Link> : <span>{i.title}</span>}
              <span className="text-muted-foreground">
                {i.extra && `${i.extra} · `}
                {new Date(i.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function DashboardContent() {
  // Request-time only: the session check reads the clock, which Next forbids while pre-rendering (partialPrefetching)
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [p, rel, art, prop] = await Promise.all([
    supabase.from("profiles").select("username, role").eq("id", user.id).maybeSingle(),
    supabase.from("releases").select("id,title_en,created_at,is_locked").eq("created_by", user.id).order("created_at", { ascending: false }),
    supabase.from("artists").select("id,name_en,created_at").eq("created_by", user.id).order("created_at", { ascending: false }),
    supabase.from("edit_proposals").select("id,target_table,status,created_at").eq("submitted_by", user.id).order("created_at", { ascending: false }),
  ]);

  const profile = p.data as unknown as { username: string | null; role: string } | null;
  const releases = ((rel.data ?? []) as unknown as { id: string; title_en: string; created_at: string; is_locked: boolean }[])
    .map((r) => ({ id: r.id, title: r.title_en, created_at: r.created_at, extra: r.is_locked ? "locked" : undefined }));
  const artists = ((art.data ?? []) as unknown as { id: string; name_en: string; created_at: string }[])
    .map((a) => ({ id: a.id, title: a.name_en, created_at: a.created_at }));
  const proposals = ((prop.data ?? []) as unknown as { id: string; target_table: string; status: string; created_at: string }[])
    .map((x) => ({ id: x.id, title: x.target_table === "release_content" ? "Tracklist & credits edit" : x.target_table === "artist_content" ? "Aliases & members edit" : `Edit to ${x.target_table}`, created_at: x.created_at, extra: x.status }));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">{profile?.username ?? user.email}</h1>
        <p className="text-sm text-muted-foreground">Role: {profile?.role ?? "user"}</p>
        <UsernameForm id={user.id} initial={profile?.username ?? ""} />
        <Link href="/contribute" prefetch={false} className="mt-3 inline-block rounded bg-foreground px-4 py-1.5 text-sm text-background">Add a release</Link>
      </header>
      <List title="Your releases" items={releases} href={(i) => `/releases/${i.id}`} />
      <List title="Your artists" items={artists} href={(i) => `/artists/${i.id}`} />
      <List title="Your edit proposals" items={proposals} />
      {profile?.role === "admin" && (
        <section>
          <h2 className="dg-h">Site cache</h2>
          <ClearCachesButton />
        </section>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
