// English primary, Amharic/Ge'ez secondary
export function Names({ en, am }: { en: string; am?: string | null }) {
  return (
    <>
      {en}
      {am && <span lang="am" className="ml-2 font-normal text-muted-foreground">{am}</span>}
    </>
  );
}
