// Where /auth/confirm may send people after a sign-in link: only paths on this site.
// (No "@/" imports here, so a plain Node script can check it.)

const hasControlChar = (s: string) => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

/**
 * `raw` (already decoded, as from searchParams.get) if it is a same-origin path, otherwise "/".
 * Rejects "//host", backslashes and control characters (browsers drop tab/CR/LF, so "/\t/host" would become "//host").
 */
export function safeNext(raw: string | null, requestUrl: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || hasControlChar(raw)) return "/";
  try {
    const base = new URL(requestUrl);
    const u = new URL(raw, base);
    return u.origin === base.origin ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
