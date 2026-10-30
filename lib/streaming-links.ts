// releases.streaming_links is a JSON object. Keys are the service, with "-2", "-3"... for further links of the
// same service: { "youtube": "...", "youtube-2": "...", "spotify": "..." }. Older rows use the plain keys only.
// The database only checks that it is an object, so these rules are applied by the forms and the release page.
// (No "@/" imports here, so a plain Node script can check it.)

export const SERVICES = {
  youtube: "YouTube",
  spotify: "Spotify",
  apple_music: "Apple Music",
  bandcamp: "Bandcamp",
  soundcloud: "SoundCloud",
  other: "Other",
} as const;
export type Service = keyof typeof SERVICES;
export type LinkRow = { service: Service; url: string };

export const MAX_LINKS = 12;
export const MAX_LINK_LENGTH = 300;

const bare = (host: string) => host.toLowerCase().replace(/^(www|m)\./, "");
const HOSTS: Record<Exclude<Service, "other">, (host: string) => boolean> = {
  youtube: (h) => ["youtube.com", "music.youtube.com", "youtu.be"].includes(bare(h)),
  spotify: (h) => bare(h) === "open.spotify.com",
  apple_music: (h) => bare(h) === "music.apple.com",
  bandcamp: (h) => bare(h) === "bandcamp.com" || bare(h).endsWith(".bandcamp.com"),
  soundcloud: (h) => bare(h) === "soundcloud.com",
};

/** The service a URL's host belongs to, or "other". */
export function serviceOf(url: string): Service {
  try {
    const host = new URL(url).hostname;
    return (Object.keys(HOSTS) as Exclude<Service, "other">[]).find((s) => HOSTS[s](host)) ?? "other";
  } catch {
    return "other";
  }
}

const TRACKING = /^(si|feature|utm_.+)$/i;

/** Checks one link and returns it without tracking parameters, or an error message. */
export function checkLink(service: Service, raw: string): { url: string } | { error: string } {
  const text = raw.trim();
  if (text.length > MAX_LINK_LENGTH) return { error: `Links can be at most ${MAX_LINK_LENGTH} characters.` };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { error: "That doesn't look like a web link." };
  }
  if (u.protocol !== "https:") return { error: "Links must start with https://." };
  if (u.username || u.password) return { error: "That doesn't look like a normal web link." };
  if (service !== "other" && !HOSTS[service](u.hostname)) return { error: `That isn't a ${SERVICES[service]} link.` };
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return { url: u.toString().replace(/\?$/, "") };
}

/** Validates the rows of the Listen editor (empty rows are ignored) and builds the object to save. */
export function buildLinks(rows: LinkRow[]): { links: Record<string, string> } | { error: string } {
  const filled = rows.filter((r) => r.url.trim());
  if (filled.length > MAX_LINKS) return { error: `Add at most ${MAX_LINKS} links.` };
  const links: Record<string, string> = {};
  const seen = new Set<string>();
  const count: Partial<Record<Service, number>> = {};
  for (const r of filled) {
    const res = checkLink(r.service, r.url);
    if ("error" in res) return { error: `${SERVICES[r.service]} link: ${res.error}` };
    if (seen.has(res.url)) return { error: `This link is listed twice: ${res.url}` };
    seen.add(res.url);
    const n = (count[r.service] = (count[r.service] ?? 0) + 1);
    links[n === 1 ? r.service : `${r.service}-${n}`] = res.url;
  }
  return { links };
}

/** Saved object -> editor rows. Unknown keys are treated by the URL's host. */
export function linksToRows(obj: unknown): LinkRow[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .map(([key, url]) => {
      const base = key.replace(/-\d+$/, "");
      return { service: base in SERVICES ? (base as Service) : serviceOf(url), url };
    });
}

/** One "Service: url" line per saved link (unfiltered, for the moderation view). */
export function describeLinks(obj: unknown): string[] {
  return linksToRows(obj).map((r) => `${SERVICES[r.service]}: ${r.url}`);
}

/** Saved object -> links safe to show (https, and on the service's own host), labelled by service. */
export function displayLinks(obj: unknown): { label: string; url: string }[] {
  const rows = linksToRows(obj).filter((r) => r.url.length <= MAX_LINK_LENGTH && "url" in checkLink(r.service, r.url));
  const total: Partial<Record<Service, number>> = {};
  rows.forEach((r) => (total[r.service] = (total[r.service] ?? 0) + 1));
  const seen: Partial<Record<Service, number>> = {};
  return rows.map((r) => {
    const n = (seen[r.service] = (seen[r.service] ?? 0) + 1);
    const label = r.service === "other" ? new URL(r.url).hostname.replace(/^www\./, "") : SERVICES[r.service];
    return { label: (total[r.service] ?? 0) > 1 && r.service !== "other" ? `${label} ${n}` : label, url: r.url };
  });
}
