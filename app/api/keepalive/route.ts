import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Called once a day by Vercel Cron (see vercel.json) so the free Supabase project never looks inactive.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("CRON_SECRET is not set", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });

  const supabase = await createClient();
  const { error } = await supabase.from("releases").select("id").limit(1);
  return NextResponse.json({ ok: !error });
}
