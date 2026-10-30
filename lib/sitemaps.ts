import { SITEMAP_SIZE, SITEMAP_TABLES, getSitemapCounts } from "@/lib/public-data";

// Sitemap ids: "pages" (fixed pages), then "<table>-<n>" for each 50,000-row chunk of a table.
// Shared by app/sitemap.ts and app/robots.ts, since Next does not generate a sitemap index.
export async function getSitemapIds() {
  const counts = await getSitemapCounts();
  return [
    "pages",
    ...SITEMAP_TABLES.flatMap((t) => Array.from({ length: Math.ceil(counts[t] / SITEMAP_SIZE) }, (_, n) => `${t}-${n}`)),
  ];
}
