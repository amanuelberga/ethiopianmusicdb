// A visible label above a form control, so a filled-in field still says what it is.
// `group` renders a <div> instead of a <label>, for controls with their own buttons (suggestion lists).
export function Field({ label, hint, group = false, className = "", children }: {
  label: string; hint?: string; group?: boolean; className?: string; children: React.ReactNode;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </Tag>
  );
}
