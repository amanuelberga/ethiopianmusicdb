import { NextResponse } from "next/server";
import {
  canonicalUrl, normalizeName, parseImportUrl, playlistEntries, videoInfos, youtubeArtist, youtubeDraft,
  type ApiPlaylistItem, type ApiVideo, type ImportResult, type ImportTarget, type YtVideoInfo,
} from "@/lib/import-link";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

// "Fill from a YouTube Music link" (step 2 of /contribute): reads a YouTube / YouTube Music playlist or a video
// to prefill the form.
// Nothing is saved. The pasted URL is never fetched: parseImportUrl() extracts ids, and only the fixed
// endpoints below are called with them.

const YT = "https://www.googleapis.com/youtube/v3";
const MAX_BODY = 2048;
const MAX_TRACKS = 60;
const TOPIC_NOTE =
  "These titles come from YouTube Music, so they are English only. For Amharic titles, use the album link from the artist's channel (Releases tab).";

// Per-user cooldown. In memory, so it only holds within one server instance: on Vercel each instance has its
// own map and a cold start empties it. It stops rapid repeat clicks, not a determined user.
const COOLDOWN_MS = 5000;
const lastCall = new Map<string, number>();

/** An error whose message is safe to show to the user. */
class ImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Please sign in to use this." }, 401);

  const now = Date.now();
  if (now - (lastCall.get(user.id) ?? 0) < COOLDOWN_MS) return json({ error: "Please wait a few seconds before trying another link." }, 429);
  lastCall.set(user.id, now);
  if (lastCall.size > 5000) for (const [id, t] of lastCall) if (now - t > COOLDOWN_MS) lastCall.delete(id);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "That request is too large." }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "That request is too large." }, 413);
  let url: unknown, typed: unknown;
  try {
    ({ url, artists: typed } = JSON.parse(raw) as { url?: unknown; artists?: unknown });
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  // artist names typed in step 1: only used to strip "<artist> - " from track titles
  const artists = Array.isArray(typed) ? typed.filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 200)).slice(0, 10) : [];
  const target = typeof url === "string" ? parseImportUrl(url) : null;
  if (!target) return json({ error: "Paste a YouTube Music album or playlist link (or a YouTube video link)." }, 400);

  // Daily import budget kept in the database (012-hardening.sql), so it holds across server instances
  const { data: allowed, error: quotaError } = await supabase.rpc("consume_import_quota");
  if (quotaError) {
    console.error("consume_import_quota failed:", quotaError.code ?? "no code");
    return json({ error: "Importing isn't available right now. Please fill the form by hand." }, 503);
  }
  if (allowed !== true) return json({ error: "The import limit for today has been reached. Please try again tomorrow." }, 429);

  try {
    return json(await fromYouTube(target, artists));
  } catch (e) {
    if (e instanceof ImportError) return json({ error: e.message }, e.status);
    console.error("import-link failed:", e instanceof Error ? e.name : "unknown error"); // no URLs: they would carry the key
    return json({ error: "Something went wrong reading that link. Please try again later." }, 502);
  }
}

// ---------- YouTube Data API v3 ----------

async function yt<T>(path: "playlists" | "playlistItems" | "videos", params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new ImportError("Importing from YouTube isn't set up on this site yet. Please fill the form by hand.", 503);
  let res: Response;
  try {
    res = await fetch(`${YT}/${path}?${new URLSearchParams({ ...params, key })}`, { cache: "no-store" });
  } catch {
    throw new ImportError("Couldn't reach YouTube. Please try again later.", 502);
  }
  if (res.ok) return (await res.json()) as T;
  // Google's error body is never passed on; only its reason code is used to pick a message.
  const reason = ((await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason ?? "";
  if (/quota|rateLimit|dailyLimit/i.test(reason)) throw new ImportError("YouTube's daily limit for this site has been reached. Please try again tomorrow or fill the form by hand.", 503);
  if (/notFound/i.test(reason) || res.status === 404) throw new ImportError("That playlist or video is private or doesn't exist.", 404);
  console.error("YouTube API error:", res.status, reason);
  throw new ImportError("YouTube couldn't be read right now. Please try again later.", 502);
}

async function fromYouTube(target: ImportTarget, typedArtists: string[]): Promise<ImportResult> {
  const link = { service: "youtube" as const, url: canonicalUrl(target) };
  let list: { title: string; channelTitle: string; publishedAt: string } | null = null;
  let infos: YtVideoInfo[];
  let notice: string | null = null;

  if (target.kind === "youtube-video") {
    const { items } = await yt<{ items: ApiVideo[] }>("videos", { part: "snippet,contentDetails", id: target.id });
    if (!items?.[0]) throw new ImportError("That video is private or doesn't exist.", 404);
    infos = videoInfos([{ id: target.id, owner: null }], items);
  } else {
    const { items: lists } = await yt<{ items: { snippet: { title: string; channelTitle: string; publishedAt: string } }[] }>("playlists", { part: "snippet", id: target.id });
    list = lists?.[0]?.snippet ?? null;
    if (!list) throw new ImportError("That playlist is private or doesn't exist.", 404);

    const entries: { id: string; owner: string | null }[] = [];
    let pageToken = "";
    do {
      const page = await yt<{ items: ApiPlaylistItem[]; nextPageToken?: string }>("playlistItems", {
        part: "snippet,contentDetails,status", playlistId: target.id, maxResults: "50", ...(pageToken ? { pageToken } : {}),
      });
      entries.push(...playlistEntries(page.items ?? []));
      pageToken = page.nextPageToken ?? "";
    } while (pageToken && entries.length < MAX_TRACKS);
    if (entries.length > MAX_TRACKS || pageToken) notice = `Only the first ${MAX_TRACKS} videos were read.`;
    const kept = entries.slice(0, MAX_TRACKS);

    // durations (and anything removed since) in batches of 50; playlist order is kept
    const videos: ApiVideo[] = [];
    for (let i = 0; i < kept.length; i += 50) {
      const { items } = await yt<{ items: ApiVideo[] }>("videos", { part: "snippet,contentDetails", id: kept.slice(i, i + 50).map((e) => e.id).join(",") });
      videos.push(...(items ?? []));
    }
    infos = videoInfos(kept, videos);
    if (!infos.length) throw new ImportError("That playlist has no public videos.", 404);
  }

  // Auto-generated album playlists belong to the "YouTube" channel, so the artist comes from the titles or the
  // video owners (see detectArtist). The form never writes it into the artist field; it is only shown in a note
  // when it differs from what the user typed.
  const { candidate, shared } = youtubeArtist(infos, list ? list.channelTitle : infos[0].owner);
  const artist = candidate ? await matchArtist(candidate) : null;
  const { topicAlbum, ...draft } = youtubeDraft(list, infos, [...typedArtists, candidate, shared, artist?.name_en]);
  if (topicAlbum) notice = [notice, TOPIC_NOTE].filter(Boolean).join(" ");
  return { ...draft, artist, link, notice };
}

/**
 * Looks the name up among existing (non-merged) artists: equal to name_en or an alias, ignoring case and
 * accents. search_all finds the candidates (it covers aliases and skips merged artists); the exact comparison is
 * done here. Exactly one match -> its canonical name (so "TEDDY AFRO" is reported as "Teddy Afro").
 */
async function matchArtist(name: string): Promise<NonNullable<ImportResult["artist"]>> {
  const hint = { name_en: name, name_am: null, matched: false };
  const db = createPublicClient();
  const { data, error } = await db.rpc("search_all", { q: name, max_results: 30 });
  if (error) return hint;
  const want = normalizeName(name);
  const ids = new Set(
    ((data ?? []) as { entity: string; entity_id: string; label: string; sublabel: string | null }[])
      .filter((h) => h.entity === "artist" && (normalizeName(h.label) === want || normalizeName(h.sublabel ?? "") === want))
      .map((h) => h.entity_id),
  );
  if (ids.size !== 1) return hint;
  const { data: a } = await db.from("artists").select("name_en,name_am").eq("id", [...ids][0]).is("merged_into", null).maybeSingle();
  const row = a as { name_en: string; name_am: string | null } | null;
  return row ? { name_en: row.name_en, name_am: row.name_am, matched: true } : hint;
}
