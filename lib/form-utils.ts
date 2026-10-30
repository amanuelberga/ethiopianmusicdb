/** Shown when a write succeeded but row-level security let it change no rows. */
export const NOTHING_CHANGED =
  "Nothing was changed. You may not have permission, or the record was locked or changed in the meantime. Reload the page and try again.";

// Database text limits (CHECK constraints in the database); the forms mirror them with maxLength.
export const MAX = {
  title: 1000, name: 500, bio: 5000, notes: 5000, catalog: 200, creditNote: 1000, role: 200, reason: 2000, username: 30,
} as const;

const FIELD: Record<string, string> = {
  len_title_en: "A title", len_title_am: "A title", len_catno: "The catalog number", len_notes: "A note",
  len_name_en: "A name", len_name_am: "A name", len_sort_name: "The sort name", len_bio_en: "The biography",
  len_bio_am: "The biography", len_role_en: "A role name", len_role_am: "A role name", len_alias: "An alias",
  len_credit_text: "A credit note", len_payload: "This edit",
};

// Messages raised by 011-editions.sql (link_release_edition, the protect_edition_of trigger, the
// releases_edition_not_self check) and by apply_edit_proposal when a proposal sets edition_of.
const EDITION_ERRORS: [string, string][] = [
  ["releases_edition_not_self", "A release can't be an edition of itself."],
  ["A release cannot be an edition of itself", "A release can't be an edition of itself."],
  ["is itself an edition", "That release is itself an edition. Pick its main release instead."],
  ["already has editions", "This release has editions of its own. Unlink those first, then link it."],
  ["Only staff can link editions", "Only moderators can link or unlink editions."],
  ['Column "edition_of" cannot be edited', "Use “Link as edition & approve” for this proposal."],
];

// Raised by replace_artist_content (012-hardening.sql) when a group lists a member the user may not edit
export const MEMBER_EDIT_ERROR =
  "You can only add members you can edit. Submit this change as a proposal so a moderator can review it.";

/** Turns database errors into messages people can act on; anything unrecognised is shown as is. */
export function friendlyDbError(error: { code?: string; message: string }): string {
  const edition = EDITION_ERRORS.find(([needle]) => error.message.includes(needle));
  if (edition) return edition[1];
  if (error.message === "Staff only") return "Only moderators can do this.";
  // 012-hardening.sql messages are already written for people
  if (error.message.startsWith("Limit reached")) return error.message;
  if (error.message.includes(MEMBER_EDIT_ERROR)) return MEMBER_EDIT_ERROR;
  if (error.code === "23514") {
    if (error.message.includes("profiles_username_format"))
      return "Usernames must be 3 to 30 characters: letters, numbers, dots, dashes or underscores.";
    const field = Object.keys(FIELD).find((k) => error.message.includes(`"${k}"`));
    return `${field ? FIELD[field] : "Some of the text"} is too long. Please shorten it and try again.`;
  }
  const limit = error.message.match(/Daily limit reached: you can add at most (\d+) new (\w+)/);
  if (limit) {
    const what = limit[2].replace(/_/g, " ").replace("edit proposals", "edit suggestions").replace("credit roles", "custom roles");
    return `You've reached today's limit of ${limit[1]} new ${what}. Please try again tomorrow.`;
  }
  return error.message;
}

const GEEZ = /[\u1200-\u139F\u2D80-\u2DDF]/;
export const hasGeez = (s: string) => GEEZ.test(s);

/** "ቴዎድሮስ ካሳሁን / Tewodros Kassahun" (either order) -> { en, am } */
export function splitScripts(text: string): { en: string; am: string } {
  const parts = text.split("/").map((p) => p.trim()).filter(Boolean);
  return { am: parts.filter(hasGeez).join(" "), en: parts.filter((p) => !hasGeez(p)).join(" ") };
}

export type Person = { name_en: string; name_am: string | null };

/** Comma / "and" / "&" separated names; each may be "English / አማርኛ". */
export function parsePeople(input: string): Person[] {
  return input
    .split(/\s*(?:,|;|\n|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const { en, am } = splitScripts(s);
      return { name_en: en || am, name_am: am || null };
    });
}

/** A YouTube video id from a full link (watch, youtu.be, shorts, embed, live) or a bare 11-character id. */
export function youtubeId(url: string): string | null {
  const t = url.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function toSeconds(d: string): number | null {
  const m = d.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
