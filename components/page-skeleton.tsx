// Still, quiet placeholders shaped like the page that is loading (no shimmer)
const bar = "rounded-sm bg-muted";

function Heading() {
  return (
    <div className="space-y-2">
      <div className={`h-8 w-1/2 ${bar}`} />
      <div className={`h-4 w-1/4 ${bar}`} />
    </div>
  );
}

// Release, artist and label pages: cover beside the title and facts, then a list of rows
export function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-8">
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className={`aspect-square w-full ${bar}`} />
        <div className="space-y-3">
          <Heading />
          {Array.from({ length: 4 }, (_, i) => <div key={i} className={`h-4 w-2/3 ${bar}`} />)}
        </div>
      </div>
      <Rows count={8} />
    </div>
  );
}

// Browse lists, role pages, search, dashboard and moderation
export function ListSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <Heading />
      <Rows count={12} />
    </div>
  );
}

// Contribute and edit forms
export function FormSkeleton() {
  return (
    <div aria-hidden="true" className="max-w-3xl space-y-6">
      <Heading />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <div className={`h-3 w-24 ${bar}`} />
          <div className={`h-9 w-full ${bar}`} />
        </div>
      ))}
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="divide-y border-y">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-4 py-2.5">
          <div className={`h-4 w-8 ${bar}`} />
          <div className={`h-4 flex-1 ${bar}`} />
          <div className={`h-4 w-12 ${bar}`} />
        </div>
      ))}
    </div>
  );
}
