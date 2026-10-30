import type { NextConfig } from "next";

// Basic security headers on every response. No full Content-Security-Policy yet: Turnstile and the
// in-browser liner-note scanner load scripts from other origins, so a strict policy needs testing first.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // no framing (clickjacking of staff buttons)
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, // modern equivalent of the line above
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Strict-Transport-Security is added once the final host is chosen.
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // prefetch one reusable shell per route; with generateStaticParams, detail pages are cached after their first visit
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
