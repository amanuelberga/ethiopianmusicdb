export type ArtistRef = { id: string; name_en: string; name_am: string | null };
export type RoleRef = { role_en: string; role_am: string | null };
export type ReleaseCard = {
  id: string;
  title_en: string;
  title_am: string | null;
  release_year: number | null;
  type: string;
  format: string;
  cover_key: string | null;
  youtube_video_id: string | null;
};
/** A release's `edition_of`: null for a main release, else the id of the main release it is an edition of. */
export type EditionOf = { edition_of: string | null };

/** One row of an "Other editions" list. */
export type EditionRef = {
  id: string;
  title_en: string;
  type: string;
  format: string;
  release_year: number | null;
  catalog_number: string | null;
  labels: { id: string; name_en: string; name_am: string | null } | null;
};
export const EDITION_SELECT = "id,title_en,type,format,release_year,catalog_number,labels(id,name_en,name_am)";

export type Hit = {
  entity: string;
  entity_id: string;
  label: string;
  sublabel: string | null;
  score: number;
};

export function hitHref(h: Hit): string | null {
  switch (h.entity) {
    case "artist": return `/artists/${h.entity_id}`;
    case "release": return `/releases/${h.entity_id}`;
    case "track": return `/tracks/${h.entity_id}`;
    case "label": return `/labels/${h.entity_id}`;
    case "role": return `/roles/${h.entity_id}`;
    default: return null;
  }
}

export function formatDuration(s: number | null): string {
  if (!s) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
