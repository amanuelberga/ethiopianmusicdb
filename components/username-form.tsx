"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendlyDbError, MAX } from "@/lib/form-utils";
import { createClient } from "@/lib/supabase/client";

export function UsernameForm({ id, initial }: { id: string; initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const name = value.trim();
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(name)) return setErr("Use 3–30 characters: letters, numbers, dots, dashes or underscores.");
    setBusy(true);
    const { error } = await createClient().from("profiles").update({ username: name }).eq("id", id);
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "That username is already taken." : friendlyDbError(error));
    setMsg("Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Username" maxLength={MAX.username} placeholder="Choose a username" className="rounded border bg-background px-2 py-1.5" />
      <button disabled={busy} className="rounded border px-3 py-1 hover:bg-muted disabled:opacity-50">{initial ? "Change username" : "Set username"}</button>
      {msg && <span className="text-ok">{msg}</span>}
      {err && <span className="text-danger">{err}</span>}
    </form>
  );
}
