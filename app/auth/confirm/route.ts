import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only same-site paths (see lib/safe-redirect)
  const next = safeNext(searchParams.get("next"), request.url);

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next);
    } else {
      // only a short code goes in the URL; /auth/error maps it to a fixed message
      redirect(`/auth/error?code=${error.code === "otp_expired" ? "expired" : "unknown"}`);
    }
  }

  redirect("/auth/error?code=invalid_link");
}
