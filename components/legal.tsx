export type LegalSection = { h: string; p: string[] };

export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  return (
    <article className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
      </header>
      {sections.map((s) => (
        <section key={s.h} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.h}</h2>
          {s.p.map((t, i) => <p key={i}>{t}</p>)}
        </section>
      ))}
    </article>
  );
}
