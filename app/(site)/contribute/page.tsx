import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FormSkeleton } from "@/components/page-skeleton";
import { ReleaseForm } from "@/components/release-form";
import { isStaff } from "@/lib/staff";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add a release", description: "Add a release, its tracklist and liner-note credits to the archive.", robots: { index: false } };

async function ContributeContent() {
  // Request-time only: the session check reads the clock, which Next forbids while pre-rendering (partialPrefetching)
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data } = await supabase.from("credit_roles").select("role_en").order("role_en");
  const roles = ((data ?? []) as unknown as { role_en: string }[]).map((r) => r.role_en);

  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold">Add a release</h1>
      <p className="mb-6 text-muted-foreground">
        Start by checking whether the release already exists. Artists and roles that already exist are matched by name automatically.
      </p>
      <ReleaseForm roles={roles} staff={await isStaff(supabase)} />
    </div>
  );
}

export default function ContributePage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ContributeContent />
    </Suspense>
  );
}
