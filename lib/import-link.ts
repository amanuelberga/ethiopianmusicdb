// "Fill from a YouTube Music link" (step 2 of /contribute): parsing pasted links and cleaning YouTube titles. Shared by the client box
// and the /api/import-link route. The pasted URL is never fetched: only the ids parsed here are sent to fixed
// endpoints. (No "@/" imports here, so a plain Node script can check it.)

export type ImportTarget = { kind: "youtube-video"; id: string } | { kind: "youtube-playlist"; id: string };

/** A title split into its English and Amharic (Ge'ez) parts; either may be "". */
export type Bilingual = { en: string; am: string };

/** What the route sends back to prefill the form. Nothing is saved. */
export type ImportResult = {
  title: Bilingual;
  year: number | null;
  type: "Album" | "Single" | null;
  // matched = exactly one existing artist has this name, so the form may fill the field with it (which links to
  // that artist); otherwise the name is only a hint
  artist: { name_en: string; name_am: string | null; matched: boolean } | null;
  coverVideoId: string | null;
  tracks: (Bilingual & { duration: string })[];
  link: { service: "youtube"; url: string };
  notice: string | null; // e.g. "the title could not be read"
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

/**
 * Strictly parses a YouTube or YouTube Music link into an id. music.youtube.com and www.youtube.com links with a
 * list= id are the same playlist. Returns null for anything else (Spotify links go in the Listen section instead).
 */
export function parseImportUrl(input: string): ImportTarget | null {
  const text = input.trim();
  if (!text || text.length > 500) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return parts.length === 1 && VIDEO_ID.test(parts[0]) ? { kind: "youtube-video", id: parts[0] } : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const list = u.searchParams.get("list");
    const v = u.searchParams.get("v");
    // a playlist page, or a video opened from a playlist (but not YouTube's auto-generated "RD" mixes)
    if (list && LIST_ID.test(list) && !list.startsWith("RD") && (parts[0] === "playlist" || parts[0] === "watch")) {
      return { kind: "youtube-playlist", id: list };
    }
    if (parts[0] === "watch" && v && VIDEO_ID.test(v)) return { kind: "youtube-video", id: v };
    if (["shorts", "embed", "live"].includes(parts[0]) && parts[1] && VIDEO_ID.test(parts[1])) {
      return { kind: "youtube-video", id: parts[1] };
    }
    return null;
  }
  return null;
}

/** Canonical link rebuilt from the parsed ids (used for fetching metadata and for the Listen section). */
export function canonicalUrl(t: ImportTarget): string {
  switch (t.kind) {
    case "youtube-video": return `https://www.youtube.com/watch?v=${t.id}`;
    case "youtube-playlist": return `https://www.youtube.com/playlist?list=${t.id}`;
  }
}

// ---------- scripts and separators ----------

const GEEZ = /[ሀ-፿ᎀ-᎟ⶀ-⷟꬀-꬯]/;
const GEEZ_ALL = /[ሀ-፿ᎀ-᎟ⶀ-⷟꬀-꬯]/g;
type Script = "geez" | "latin" | "mixed" | "neutral";

/** Ge'ez, Latin (any letter outside the Ge'ez blocks), both, or neither (digits/punctuation only). */
export function scriptOf(s: string): Script {
  const g = GEEZ.test(s);
  const l = /\p{L}/u.test(s.replace(GEEZ_ALL, ""));
  return g && l ? "mixed" : g ? "geez" : l ? "latin" : "neutral";
}

const SEPS = [" - ", " – ", " — ", " | ", " ｜ ", " / ", " = ", " : "];
type Seg = { text: string; sep: string | null }; // sep: the separator before this segment

/** Splits on the separators above, but never inside (), [], {} and their full-width forms. */
export function splitTopLevel(s: string): Seg[] {
  const out: Seg[] = [];
  let depth = 0, start = 0, sep: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ("([{（［".includes(c)) depth++;
    else if (")]}）］".includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === " ") {
      const hit = SEPS.find((x) => s.startsWith(x, i));
      if (hit) {
        out.push({ text: s.slice(start, i).trim(), sep });
        sep = hit.trim();
        start = i + hit.length;
        i += hit.length - 1;
      }
    }
  }
  out.push({ text: s.slice(start).trim(), sep });
  return out.filter((x) => x.text);
}

/** For comparing names: no accents, lower case, single spaces. */
export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// "(Official Lyrics Video)", "[HD]"... anywhere, plus a bare year right after such a tag ("(Official Audio) 2026")
const NOISE_TAG = /\s*[([]\s*(?:official\s+)?(?:music\s+video|lyrics?\s+video|lyrics?|video\s+clip|video|audio|visuali[sz]er|hd|hq|4k)\s*[)\]](?:\s+(?:19|20)\d{2}\b)?/gi;
// whole segments that are only noise: "Track 4", "Track No. 4", "Official Lyrics Video", "Lyrics", "2026", "HD"...
const NOISE_SEG = /^(?:track\s*(?:no\.?\s*)?\d+|(?:official\s+)?(?:music\s+video|lyrics?\s+video|lyrics?|video\s+clip|video|audio|visuali[sz]er)|official|hd|hq|4k)?(?:\s*(?:19|20)\d{2})?$/i;

const isGeezChar = (c: string) => GEEZ.test(c);
const isLatinChar = (c: string) => /\p{L}/u.test(c) && !GEEZ.test(c);

// "ጽዮን ሙሽራዬ -Tsion Mushraye" / "ጽዮን ሙሽራዬ-Tsion": a hyphen between Ge'ez and Latin text is a separator even
// without spaces. "Ye-Tizita" (Latin both sides) and Ge'ez-Ge'ez hyphens are left alone.
function spaceScriptHyphens(t: string): string {
  return t.replace(/\s*[-–]\s*/g, (m, at: number) => {
    if (/^\s.*\s$/.test(m)) return m; // already " - "
    const before = [...t.slice(0, at)].reverse().find((c) => /\p{L}/u.test(c)) ?? "";
    const after = [...t.slice(at + m.length)].find((c) => /\p{L}/u.test(c)) ?? "";
    const cross = (isGeezChar(before) && isLatinChar(after)) || (isLatinChar(before) && isGeezChar(after));
    return cross ? ` ${m.trim()} ` : m;
  });
}

/** Noise removed, script-boundary hyphens spaced, split at top-level separators, noise-only segments dropped. */
function segmentsOf(raw: string): Seg[] {
  const t = spaceScriptHyphens(raw.replace(/\s+/g, " ").replace(NOISE_TAG, "")).replace(/\s+/g, " ").trim();
  const segs = splitTopLevel(t).filter((x) => !NOISE_SEG.test(x.text));
  return segs.length ? [{ ...segs[0], sep: null }, ...segs.slice(1)] : [];
}
const joinSegs = (segs: Seg[]) => segs.map((x, i) => (i ? ` ${x.sep} ` : "") + x.text).join("");

// "ዳስ ጣል (Das Tal)" or "(Das Tal) ዳስ ጣል": Ge'ez text plus ONE all-Latin group in parentheses
function parenPair(text: string): Bilingual | null {
  const end = text.match(/^(.+?)\s*[(（]([^()（）]+)[)）]$/);
  if (end && scriptOf(end[1]) === "geez" && scriptOf(end[2]) === "latin") return { am: end[1].trim(), en: end[2].trim() };
  const start = text.match(/^[(（]([^()（）]+)[)）]\s*(.+)$/);
  if (start && scriptOf(start[2]) === "geez" && scriptOf(start[1]) === "latin") return { am: start[2].trim(), en: start[1].trim() };
  return null;
}

// one Ge'ez part and one Latin part, after merging neighbours of the same script (neutral parts join a neighbour)
function bilingualOf(segs: Seg[]): Bilingual | null {
  if (!segs.length) return null;
  if (segs.length === 1) return parenPair(segs[0].text);
  const groups: { script: Script; texts: string[] }[] = [];
  for (const x of segs) {
    const sc = scriptOf(x.text);
    const last = groups[groups.length - 1];
    if (last && (sc === "neutral" || sc === last.script || last.script === "neutral")) {
      last.texts.push(x.text);
      if (last.script === "neutral") last.script = sc;
    } else groups.push({ script: sc, texts: [x.text] });
  }
  const g = groups.find((x) => x.script === "geez"), l = groups.find((x) => x.script === "latin");
  return groups.length === 2 && g && l ? { am: g.texts.join(" - "), en: l.texts.join(" - ") } : null;
}

/**
 * Splits a YouTube title into English and Amharic.
 * 1. Removes "(Official Video)"-style tags, spaces out hyphens between Ge'ez and Latin text, splits at top-level
 *    " - ", " | ", " / "... (never inside parentheses) and drops segments that are only noise ("Track 4", "2026").
 * 2. Drops a leading segment equal to one of `prefixes` (the artist; case and accents ignored).
 * 3. Looks for one Ge'ez and one Latin part (same-script neighbours are joined), or Ge'ez text with one Latin
 *    group in parentheses. Trailing " | ..." segments are dropped one by one until that works.
 * Ge'ez text is never changed. Ge'ez only -> { am, en: "" }; Latin only -> { en, am: "" }.
 */
export function splitBilingual(raw: string, prefixes: (string | null | undefined)[] = []): Bilingual {
  let segs = segmentsOf(raw);
  const pre = new Set(prefixes.filter((p): p is string => !!p?.trim()).map(normalizeName));
  if (segs.length > 1 && pre.has(normalizeName(segs[0].text))) segs = [{ ...segs[1], sep: null }, ...segs.slice(2)];
  // the whole title first, then without each trailing " | ..." part (promo text, channel names)
  const cuts = [segs.length, ...segs.map((x, i) => (i > 0 && (x.sep === "|" || x.sep === "｜") ? i : -1)).filter((i) => i > 0).reverse()];
  for (const n of cuts) {
    const pair = bilingualOf(segs.slice(0, n));
    if (pair) return pair;
  }
  const text = joinSegs(segs.slice(0, Math.min(...cuts))).replace(/\s*[-–—|]\s*$/, "").trim();
  return scriptOf(text) === "geez" || scriptOf(text) === "mixed" ? { en: "", am: text } : { en: text, am: "" };
}

// ---------- artist detection ----------

const NOT_AN_ARTIST = /^(youtube|various|various artists|va|v\.a\.|unknown|unknown artist|release)$/i;

/** The name, unless it is empty or a placeholder like "YouTube" or "Various Artists". */
export function usableArtist(name: string | null | undefined): string | null {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  return n && !NOT_AN_ARTIST.test(n) ? n : null;
}

/** "Teddy Afro - Topic" / "TeddyAfroVEVO" / "Aster Aweke Official Channel" -> the artist part. */
export function cleanChannel(name: string): string {
  let n = name.replace(/\s+/g, " ").trim();
  for (let prev = ""; prev !== n; ) {
    prev = n;
    n = n.replace(/\s*-\s*Topic$/i, "").replace(/\s*VEVO$/i, "").replace(/\s*Official(\s+Channel)?$/i, "").trim();
  }
  return n;
}

const isAllCaps = (s: string) => /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s);
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** A leading "<X> - " shared by at least 60% of the titles (most common spelling; ALL CAPS is title-cased). */
export function sharedPrefix(titles: string[]): string | null {
  if (titles.length < 2) return null;
  const byKey = new Map<string, Map<string, number>>();
  for (const t of titles) {
    const segs = segmentsOf(t);
    if (segs.length < 2) continue;
    const forms = byKey.get(normalizeName(segs[0].text)) ?? new Map<string, number>();
    forms.set(segs[0].text, (forms.get(segs[0].text) ?? 0) + 1);
    byKey.set(normalizeName(segs[0].text), forms);
  }
  let best: Map<string, number> | null = null, bestN = 0;
  for (const forms of byKey.values()) {
    const n = [...forms.values()].reduce((a, b) => a + b, 0);
    if (n > bestN) [best, bestN] = [forms, n];
  }
  if (!best || bestN / titles.length < 0.6) return null;
  const form = [...best.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return isAllCaps(form) ? titleCase(form) : form;
}

/** The likeliest artist: a shared title prefix, else the most common video owner channel, else the channel. */
export function detectArtist(o: { titles: string[]; owners?: (string | null | undefined)[]; channel?: string | null }): string | null {
  const prefix = usableArtist(sharedPrefix(o.titles));
  if (prefix) return prefix;
  const counts = new Map<string, number>();
  for (const raw of o.owners ?? []) {
    const n = usableArtist(cleanChannel(raw ?? ""));
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const owner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return owner ?? usableArtist(cleanChannel(o.channel ?? ""));
}

// ---------- YouTube responses -> form data (no network; the route fetches) ----------

export type YtVideoInfo = { id: string; title: string; owner: string | null; publishedAt: string; duration: string };

// The parts of the YouTube Data API v3 resources that are used
export type ApiPlaylistItem = {
  snippet: { title: string; videoOwnerChannelTitle?: string };
  contentDetails: { videoId: string };
  status?: { privacyStatus: string };
};
export type ApiVideo = { id: string; snippet: { title: string; channelTitle: string; publishedAt: string }; contentDetails: { duration: string } };

/** Playlist items -> video ids in order with their owner channels, skipping private and deleted videos. */
export function playlistEntries(items: ApiPlaylistItem[]): { id: string; owner: string | null }[] {
  return items
    .filter((it) => it.contentDetails?.videoId && it.status?.privacyStatus !== "private" && !/^(private|deleted) video$/i.test(it.snippet.title))
    .map((it) => ({ id: it.contentDetails.videoId, owner: it.snippet.videoOwnerChannelTitle ?? null }));
}

/** Joins playlist entries with videos.list results (videos missing there were removed: they are skipped). */
export function videoInfos(entries: { id: string; owner: string | null }[], videos: ApiVideo[]): YtVideoInfo[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  return entries.flatMap((e) => {
    const v = byId.get(e.id);
    return v ? [{ id: v.id, title: v.snippet.title, owner: e.owner ?? v.snippet.channelTitle, publishedAt: v.snippet.publishedAt, duration: v.contentDetails.duration }] : [];
  });
}

/** Step 1: the artist candidate and every prefix to strip from titles. */
export function youtubeArtist(videos: YtVideoInfo[], channel: string | null) {
  const titles = videos.map((v) => v.title);
  return { candidate: detectArtist({ titles, owners: videos.map((v) => v.owner), channel }), shared: sharedPrefix(titles) };
}

/** A YouTube Music album: most tracks come from "<name> - Topic" channels (their titles are English only). */
export function isTopicAlbum(videos: YtVideoInfo[]): boolean {
  return videos.length > 0 && videos.filter((v) => / - Topic$/i.test(v.owner ?? "")).length > videos.length / 2;
}

/** Step 2: titles, tracks, year and cover for a playlist (list = its snippet) or a single video (list = null). */
export function youtubeDraft(list: { title: string; publishedAt: string } | null, videos: YtVideoInfo[], prefixes: (string | null | undefined)[]) {
  const tracks = videos.map((v) => ({ ...splitBilingual(v.title, prefixes), duration: isoToMinSec(v.duration) }));
  // auto-generated album playlists are often called "Album - <title>"
  const title = list ? splitBilingual(list.title.replace(/^\s*Album\s*[-–—:]\s*/i, ""), prefixes) : { en: tracks[0]?.en ?? "", am: tracks[0]?.am ?? "" };
  // YouTube Music album tracks come from "<name> - Topic" channels and their thumbnail is the album art
  const cover = (list ? videos.find((v) => / - Topic$/i.test(v.owner ?? "")) : undefined) ?? videos[0];
  const years = [list?.publishedAt, ...videos.map((v) => v.publishedAt)]
    .map((d) => (d ? new Date(d).getUTCFullYear() : NaN)).filter((y) => Number.isFinite(y));
  return {
    title, tracks, type: (list ? "Album" : "Single") as "Album" | "Single", topicAlbum: !!list && isTopicAlbum(videos),
    year: years.length ? Math.min(...years) : null, coverVideoId: cover?.id ?? null,
  };
}

/** ISO 8601 duration ("PT1H2M3S") -> "62:03". Returns "" for anything else. */
export function isoToMinSec(iso: string): string {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return "";
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
