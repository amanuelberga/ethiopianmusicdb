"use client";

import { useId, useRef, useState } from "react";

/**
 * Accessible tabs (WAI-ARIA tabs pattern: arrow keys, Home/End). Every panel stays mounted and inactive ones
 * are only hidden, so switching tabs never loses what was typed or scanned in a panel.
 */
export function Tabs({ label, tabs }: { label: string; tabs: { id: string; title: string; content: React.ReactNode }[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="grid grid-cols-3 gap-1 rounded border p-1">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded px-1.5 py-1.5 text-xs font-semibold leading-tight ${active === t.id ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            {t.title}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={active !== t.id}
          tabIndex={0}
          className="mt-3"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
