import { ImageResponse } from "next/og";

export const alt = "Ethiopian Music DB";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", background: "#221f1b", color: "#f6f3ec", padding: 80 }}>
        <div style={{ fontSize: 84, fontWeight: 700 }}>Ethiopian Music DB</div>
        <div style={{ fontSize: 36, marginTop: 24, color: "#c9c2b5" }}>An open archive of releases, tracks and credits</div>
      </div>
    ),
    { ...size },
  );
}
