import type { Metadata } from "next";
import { Suspense } from "react";
import { EntityEditPage } from "@/components/entity-edit-page";
import { FormSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Edit artist", description: "Edit an artist or suggest changes.", robots: { index: false } };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EntityEditPage table="artists" id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
