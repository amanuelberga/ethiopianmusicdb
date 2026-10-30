import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Only the routes that read the session on the server (or that the proxy redirects). Public pages, sitemaps,
// robots.txt and /api/keepalive don't run it, so they can be served from the cache without any server code;
// the browser client keeps the session fresh there. Server actions (lib/refresh.ts) refresh the token themselves:
// they may set cookies, so the Supabase server client writes a refreshed session onto their response.
export const config = {
  matcher: [
    "/contribute/:path*",
    "/dashboard/:path*",
    "/moderation/:path*",
    "/auth/:path*",
    "/(releases|artists|labels)/:id/edit",
    "/api/import-link",
  ],
};
