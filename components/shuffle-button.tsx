"use client";

export function ShuffleButton({ onShuffle, pending, className = "" }: { onShuffle: () => void; pending: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onShuffle}
      disabled={pending}
      aria-label="Show other random releases"
      className={`rounded border border-current px-3 py-1 text-sm font-semibold hover:opacity-80 disabled:opacity-50 ${className}`}
    >
      {pending ? "Shuffling…" : "Shuffle"}
    </button>
  );
}
