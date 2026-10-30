"use client";

import { useState } from "react";
import { clearAllCaches } from "@/lib/refresh";

// Admin only (the dashboard shows it to admins; the server action checks again). For changes made outside the
// app, e.g. in the SQL editor, which the per-record refresh after a save can't see.
export function ClearCachesButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  async function clear() {
    setState("busy");
    const ok = await clearAllCaches().catch(() => false);
    setState(ok ? "done" : "failed");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button onClick={clear} disabled={state === "busy"} className="rounded border px-3 py-1 hover:bg-muted disabled:opacity-50">
        {state === "busy" ? "Clearing…" : "Clear all caches"}
      </button>
      {state === "done" && <span className="text-ok">Done. Every page is rebuilt on its next visit.</span>}
      {state === "failed" && <span className="text-danger">That didn&apos;t work. Only admins can clear the caches.</span>}
      {state === "idle" && <span className="text-muted-foreground">Use after changing data outside the site, e.g. in the SQL editor.</span>}
    </div>
  );
}
