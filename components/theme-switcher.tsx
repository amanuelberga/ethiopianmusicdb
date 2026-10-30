"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();

  // false on the server and during hydration, true afterwards on the client, so the UI only shows once mounted
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  if (!mounted) {
    return null;
  }

  return (
    <div role="group" aria-label="Colour theme" className="flex gap-1 text-muted-foreground">
      {THEMES.map((t, i) => (
        <span key={t.value}>
          {i > 0 && <span aria-hidden="true">· </span>}
          <button
            type="button"
            aria-pressed={theme === t.value}
            onClick={() => setTheme(t.value)}
            className={theme === t.value ? "text-foreground underline" : "hover:underline"}
          >
            {t.label}
          </button>
        </span>
      ))}
    </div>
  );
};

export { ThemeSwitcher };
