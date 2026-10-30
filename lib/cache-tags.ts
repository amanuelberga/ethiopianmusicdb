// Cache tags for the cached public pages (see lib/refresh.ts, which expires them after a save).
// A detail page's cached data carries its own tag first, then ALL_TAG, then the tags of the records it shows, so a
// change to any of them clears it. Next accepts at most 128 tags per cacheTag() call; the rest are dropped and
// those pages refresh when their cache lifetime ends. Every cached read carries ALL_TAG ("Clear all caches").
export type RecordKind = "release" | "artist" | "label" | "role";

export const KIND_OF = { releases: "release", artists: "artist", labels: "label" } as const;

export const ALL_TAG = "all"; // every cached read; cleared by the admin "Clear all caches" button
export const LISTS_TAG = "lists"; // home page, /releases, /artists
export const ROLES_TAG = "roles"; // every role page; cleared by every release save
export const recordTag = (kind: RecordKind, id: string) => `${kind}:${id}`;

export function tagList(own: string, related: Iterable<string>): string[] {
  return [own, ALL_TAG, ...[...new Set(related)].filter((t) => t !== own && t !== ALL_TAG)].slice(0, 128);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
