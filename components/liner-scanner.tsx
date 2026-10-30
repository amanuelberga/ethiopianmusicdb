"use client";

import { useState } from "react";

const MAX_FILES = 4;

export function LinerScanner() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function scan(all: File[]) {
    const files = all.slice(0, MAX_FILES);
    if (!files.length) return;
    const base = (text.match(/--- Photo \d+ ---/g) ?? []).length;
    setBusy(true);
    setError(all.length > MAX_FILES ? `Only the first ${MAX_FILES} photos were scanned.` : null);
    try {
      const { createWorker } = await import("tesseract.js");
      let current = 1;
      const worker = await createWorker(["amh", "eng"], 1, {
        logger: (m) => {
          if (m.status === "recognizing text") setStatus(`Photo ${current} of ${files.length}: ${Math.round(m.progress * 100)}%`);
        },
      });
      for (let i = 0; i < files.length; i++) {
        current = i + 1;
        setStatus(`Photo ${current} of ${files.length}…`);
        const { data } = await worker.recognize(files[i]);
        setText((prev) => `${prev}${prev ? "\n\n" : ""}--- Photo ${base + current} ---\n${data.text.trim()}`);
      }
      await worker.terminate();
    } catch {
      setError("Scan failed. You can still type or paste text here.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  async function copyAll() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2 rounded border p-3">
      <p className="text-sm font-medium">Liner note scanner</p>
      <p className="text-xs text-muted-foreground">
        Pick up to {MAX_FILES} photos. They are read in your browser and never uploaded or saved, and this text is not
        stored. Check it, then copy what you need into the form. The first scan downloads English and Amharic language data.
      </p>
      <input
        aria-label="Liner-note photos to scan" type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          scan(files);
        }}
        className="text-sm"
      />
      {busy && <p className="text-xs">{status}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
        aria-label="Scanned text" placeholder="Scanned text appears here. You can edit it."
        className="w-full rounded border bg-background p-2 text-sm"
      />
      <div className="flex gap-2">
        <button type="button" disabled={!text} onClick={copyAll} className="rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50">
          {copied ? "Copied" : "Copy all"}
        </button>
        <button type="button" disabled={!text || busy} onClick={() => setText("")} className="rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50">
          Clear
        </button>
      </div>
    </div>
  );
}
