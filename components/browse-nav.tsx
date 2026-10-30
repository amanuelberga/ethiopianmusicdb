import Link from "next/link";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function AlphaBar({ base, letter }: { base: string; letter?: string }) {
  const cls = (on: boolean) => `rounded px-2 py-0.5 ${on ? "bg-foreground text-background" : "hover:bg-muted"}`;
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      <Link href={base} className={cls(!letter)}>All</Link>
      {LETTERS.map((l) => (
        <Link key={l} href={`${base}?letter=${l}`} className={cls(letter === l)}>{l}</Link>
      ))}
    </nav>
  );
}

export function Pager({ base, letter, page, total, size }: { base: string; letter?: string; page: number; total: number; size: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => `${base}?${new URLSearchParams({ ...(letter ? { letter } : {}), page: String(p) })}`;
  return (
    <nav className="flex items-center justify-between pt-4 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="underline">Previous</Link> : <span />}
      <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
      {page < pages ? <Link href={href(page + 1)} className="underline">Next</Link> : <span />}
    </nav>
  );
}
