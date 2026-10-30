"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIND_OF } from "@/lib/cache-tags";
import { friendlyDbError, NOTHING_CHANGED } from "@/lib/form-utils";
import { refreshRecords } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/client";

export function LockButton({ table, id, locked }: { table: "releases" | "artists" | "labels"; id: string; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null);
    const { data, error } = await createClient().from(table).update({ is_locked: !locked }).eq("id", id).select("id");
    if (error || !data?.length) {
      setBusy(false);
      return setErr(error ? friendlyDbError(error) : NOTHING_CHANGED);
    }
    await refreshRecords([{ kind: KIND_OF[table], id }]).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={busy}
        title={locked ? "Allow edits again" : "Lock as canonical: only staff can change it"}
        className="rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
      >
        {locked ? "Unlock" : "Lock"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
