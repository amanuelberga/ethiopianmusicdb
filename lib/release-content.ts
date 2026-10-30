import { parsePeople, toSeconds, type Person } from "@/lib/form-utils";
import { formatDuration } from "@/lib/types";

export type CreditRow = { role: string; names: string; note: string; credited_as: string };
export type TrackRow = { id?: string; title_en: string; title_am: string; side: string; duration: string; performers: string; featured: string; credits: CreditRow[] };
export type EditorState = { artists: string; credits: CreditRow[]; tracks: TrackRow[] };

type CreditPayload = { role: string; notes: string; people: (Person & { credited_as?: string })[] };
type TrackPayload = {
  id: string | null; title_en: string; title_am: string; side: string;
  duration_seconds: number | null; credits: CreditPayload[];
  performers: Person[]; featured: Person[];
};
export type ContentPayload = { artists: Person[]; credits: CreditPayload[]; tracks: TrackPayload[] };

type Pers = { id?: string; name_en: string; name_am: string | null };
type DbCredit = { credited_as: string | null; notes: string | null; artists: Pers; credit_roles: { role_en: string } };
export type DbRelease = {
  release_artists: { position: number; artists: Pers }[];
  release_credits: DbCredit[];
  tracks: {
    id: string; disc_number: number; side: string; position: number; title_en: string; title_am: string | null;
    duration_seconds: number | null; track_credits: DbCredit[];
    track_artists: { is_featured: boolean; position: number; artists: Pers }[];
  }[];
};

// Scalars + everything the edit form / moderation diff needs
export const RELEASE_CONTENT_SELECT = `id,title_en,title_am,release_year,release_year_ec,catalog_number,type,format,youtube_video_id,streaming_links,notes,created_by,is_locked,
  release_artists(position, artists(id,name_en,name_am)),
  release_credits(credited_as, notes, artists(id,name_en,name_am), credit_roles(role_en)),
  tracks(id,disc_number,side,position,title_en,title_am,duration_seconds,
    track_artists(is_featured, position, artists(id,name_en,name_am)),
    track_credits(credited_as, notes, artists(id,name_en,name_am), credit_roles(role_en)))`;

/** Every artist a release shows (release artists, performers, credits): their pages list it. */
export function releaseArtistIds(r: DbRelease): string[] {
  const all = [
    ...r.release_artists, ...r.release_credits,
    ...r.tracks.flatMap((t) => [...t.track_artists, ...t.track_credits]),
  ].map((x) => x.artists.id);
  return [...new Set(all.filter((id): id is string => !!id))];
}

const fmt = (a: Pers) => (a.name_am && a.name_am !== a.name_en ? `${a.name_en} / ${a.name_am}` : a.name_en);
const toRows = (cs: DbCredit[]): CreditRow[] =>
  cs.map((c) => ({ role: c.credit_roles.role_en, names: fmt(c.artists), note: c.notes ?? "", credited_as: c.credited_as ?? "" }));

const perf = (t: DbRelease["tracks"][number], featured: boolean) =>
  t.track_artists.filter((x) => x.is_featured === featured).sort((a, b) => a.position - b.position).map((x) => fmt(x.artists)).join(", ");

export function releaseToState(r: DbRelease): EditorState {
  return {
    artists: [...r.release_artists].sort((a, b) => a.position - b.position).map((x) => fmt(x.artists)).join(", "),
    credits: toRows(r.release_credits),
    tracks: [...r.tracks]
      .sort((a, b) => a.disc_number - b.disc_number || a.side.localeCompare(b.side) || a.position - b.position)
      .map((t) => ({
        id: t.id, title_en: t.title_en, title_am: t.title_am ?? "", side: t.side,
        duration: t.duration_seconds ? formatDuration(t.duration_seconds) : "", credits: toRows(t.track_credits),
        performers: perf(t, false), featured: perf(t, true),
      })),
  };
}

const credits = (rows: CreditRow[]): CreditPayload[] =>
  rows.filter((r) => r.role.trim() && r.names.trim()).map((r) => {
    const people = parsePeople(r.names);
    return {
      role: r.role.trim(), notes: r.note.trim(),
      people: people.map((p) => ({ ...p, credited_as: people.length === 1 ? r.credited_as.trim() : "" })),
    };
  });

export function stateToContent(s: EditorState): ContentPayload {
  return {
    artists: parsePeople(s.artists),
    credits: credits(s.credits),
    tracks: s.tracks.filter((t) => t.title_en.trim() || t.title_am.trim()).map((t) => ({
      id: t.id ?? null, title_en: t.title_en.trim() || t.title_am.trim(), title_am: t.title_am.trim(),
      side: t.side.trim().toUpperCase(), duration_seconds: toSeconds(t.duration), credits: credits(t.credits),
      performers: parsePeople(t.performers), featured: parsePeople(t.featured),
    })),
  };
}

/** One readable line per fact, so moderators can see added/removed lines. */
export function describeContent(c: ContentPayload): string[] {
  const lines = [`Artists: ${c.artists.map((a) => a.name_en).join(", ")}`];
  const add = (prefix: string, list: CreditPayload[]) =>
    list.forEach((x) => x.people.forEach((p) => lines.push(`${prefix}${x.role} – ${p.name_en}${x.notes ? ` (${x.notes})` : ""}`)));
  add("Album credit · ", c.credits);
  c.tracks.forEach((t) => {
    (t.performers ?? []).forEach((x) => lines.push(`Track “${t.title_en}” · Performer – ${x.name_en}`));
    (t.featured ?? []).forEach((x) => lines.push(`Track “${t.title_en}” · Featured – ${x.name_en}`));
    add(`Track “${t.title_en}” · `, t.credits);
  });
  lines.push(
    "Tracklist: " +
      c.tracks.map((t, i) =>
        `${i + 1}. ${t.title_en}${t.title_am ? ` / ${t.title_am}` : ""}${t.side ? ` (side ${t.side})` : ""}${t.duration_seconds ? ` [${formatDuration(t.duration_seconds)}]` : ""}`,
      ).join(" | "),
  );
  return lines;
}
