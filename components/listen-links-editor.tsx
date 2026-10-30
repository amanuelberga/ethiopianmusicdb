"use client";

import { checkLink, MAX_LINK_LENGTH, MAX_LINKS, SERVICES, serviceOf, type LinkRow, type Service } from "@/lib/streaming-links";
import { RemoveIcon } from "@/components/icons";
import { Field } from "@/components/field";

const inp = "w-full rounded border bg-background px-2 py-1.5 text-sm";

/** Add / remove streaming links. Rows are checked as you type; the form checks them again on submit. */
export function ListenLinksEditor({ rows, onChange }: { rows: LinkRow[]; onChange: (rows: LinkRow[]) => void }) {
  const upd = (i: number, patch: Partial<LinkRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const res = r.url.trim() ? checkLink(r.service, r.url) : null;
        return (
          <div key={i}>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[150px_1fr_auto]">
              <Field label="Service"><select className={inp} aria-label={`Link ${i + 1} service`} value={r.service} onChange={(e) => upd(i, { service: e.target.value as Service })}>
                {(Object.keys(SERVICES) as Service[]).map((s) => <option key={s} value={s}>{SERVICES[s]}</option>)}
              </select></Field>
              <Field label="Link" className="col-span-2 sm:col-span-1"><input
                className={inp}
                type="url"
                inputMode="url"
                aria-label={`Link ${i + 1} address`}
                aria-invalid={res !== null && "error" in res}
                maxLength={MAX_LINK_LENGTH}
                placeholder="https://…"
                value={r.url}
                onChange={(e) => {
                  const url = e.target.value;
                  // pick the service from a pasted link while the row is still on the default
                  const detected = serviceOf(url.trim());
                  upd(i, r.service === "other" && detected !== "other" ? { url, service: detected } : { url });
                }}
              /></Field>
              <button type="button" className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto justify-self-start py-2" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}><RemoveIcon /></button>
            </div>
            {res && "error" in res && <p className="mt-1 text-xs text-danger">{res.error}</p>}
          </div>
        );
      })}
      {rows.length < MAX_LINKS && (
        <button type="button" className="text-sm underline" onClick={() => onChange([...rows, { service: "other", url: "" }])}>
          + Add link
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        YouTube (video or playlist), Spotify, Apple Music, Bandcamp, SoundCloud, or any other https link. Up to {MAX_LINKS}.
      </p>
    </div>
  );
}
