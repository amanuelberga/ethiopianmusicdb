// Small inline icons for buttons whose meaning is carried by their aria-label
const svg = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, "aria-hidden": true };

export function RemoveIcon() {
  return <svg {...svg}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
}

export function UpIcon() {
  return <svg {...svg}><path d="M8 13V3M4 7l4-4 4 4" /></svg>;
}

export function DownIcon() {
  return <svg {...svg}><path d="M8 3v10M4 9l4 4 4-4" /></svg>;
}
