import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

// Search results link tracks here; send them to the parent release, scrolled to the track.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase.from("tracks").select("release_id").eq("id", id).maybeSingle();
  return NextResponse.redirect(new URL(data ? `/releases/${data.release_id}#track-${id}` : "/", req.url));
}
