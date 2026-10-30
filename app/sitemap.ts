import type { MetadataRoute } from "next";
import { SITEMAP_SIZE, SITEMAP_TABLES, getSitemapRows, type SitemapTable } from "@/lib/public-data";
import { getSitemapIds } from "@/lib/sitemaps";
import { SITE_URL } from "@/lib/site";

// Served at /sitemap/<id>.xml; robots.txt lists every id.
export async function generateSitemaps() {
  return (await getSitemapIds()).map((id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  // unknown ids (e.g. releases-99999) get an empty sitemap without a database read or a cache entry of their own
  if (!(await getSitemapIds()).includes(id)) return [];
  if (id === "pages") {
    return [{ url: SITE_URL }, { url: `${SITE_URL}/artists` }, { url: `${SITE_URL}/releases` }];
  }
  const [table, n] = id.split("-");
  if (!SITEMAP_TABLES.includes(table as SitemapTable) || !/^\d+$/.test(n ?? "")) return [];
  const rows = await getSitemapRows(table as SitemapTable, Number(n) * SITEMAP_SIZE);
  return rows.map((r) => ({ url: `${SITE_URL}/${table}/${r.id}`, lastModified: r.updated_at }));
}
