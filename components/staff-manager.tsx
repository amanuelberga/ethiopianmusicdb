"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { friendlyDbError, NOTHING_CHANGED } from "@/lib/form-utils";
import { createClient } from "@/lib/supabase/client";

type P = { id: string; username: string | null; role: string };

function Row({ p, me }: { p: P; me: string }) {
  const router = useRouter();
  const [role, setRole] = useState(p.role);
  const [err, setErr] = useState<string | null>(null);

  async function change(next: string) {
    setErr(null);
    const prev = role;
    setRole(next);
    const { data, error } = await createClient().from("profiles").update({ role: next }).eq("id", p.id).select("id");
    if (error) { setRole(prev); return setErr(friendlyDbError(error)); }
    if (!data?.length) { setRole(prev); return setErr(NOTHING_CHANGED); }
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span>{p.username ?? p.id.slice(0, 8)}{p.id === me && <span className="text-muted-foreground"> (you)</span>}</span>
      <span className="flex items-center gap-2">
        <select aria-label={`Role for ${p.username ?? p.id.slice(0, 8)}`} value={role} disabled={p.id === me} onChange={(e) => change(e.target.value)} className="rounded border bg-background px-2 py-1">
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </select>
        {err && <span className="text-xs text-danger">{err}</span>}
      </span>
    </li>
  );
}

export function StaffManager({ staff, me }: { staff: P[]; me: string }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<P[]>([]);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let off = false;
    const timer = setTimeout(async () => {
      const { data } = await createClient().from("profiles").select("id,username,role").ilike("username", `%${term}%`).limit(8);
      if (!off) setFound((data ?? []) as P[]);
    }, 250);
    return () => { off = true; clearTimeout(timer); };
  }, [term]);

  return (
    <div className="space-y-4">
      <ul className="divide-y">{staff.map((p) => <Row key={p.id} p={p} me={me} />)}</ul>
      <div>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a user by username" placeholder="Find a user by username to change their role…" className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        {term.length >= 2 && (
          <ul className="divide-y">
            {found.length === 0 && <li className="py-2 text-sm text-muted-foreground">No matching usernames.</li>}
            {found.map((p) => <Row key={p.id} p={p} me={me} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
