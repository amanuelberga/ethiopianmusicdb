// Homepage section heading: a solid bar in the text colour, with an optional control on the right
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-sm bg-foreground px-4 py-2.5 text-background">
      <h2 className="text-xl font-bold">{children}</h2>
      {action}
    </div>
  );
}
