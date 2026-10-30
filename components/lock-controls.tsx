import { DeleteButton } from "@/components/delete-button";
import { LockButton } from "@/components/lock-button";
import { StaffOnly } from "@/components/use-account";

type Table = "releases" | "artists" | "labels";

// Everyone sees the "locked" badge. The page is cached and the same for everyone, so the staff buttons (plus any
// extra staff controls passed as children) appear in the browser once the role is known. The row always keeps one
// button's height, so nothing below it moves when they appear.
export function LockControls({ table, id, locked, name = "this record", children }: {
  table: Table; id: string; locked: boolean; name?: string; children?: React.ReactNode;
}) {
  return (
    <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2 text-sm">
      {locked && <span title="Reviewed by moderators; its data is deemed canonical">Locked (canonical)</span>}
      <StaffOnly>
        <LockButton table={table} id={id} locked={locked} />
        <DeleteButton table={table} id={id} name={name} />
        {children}
      </StaffOnly>
    </div>
  );
}
