import type { MetadataRoute } from "next";
import { getSitemapIds } from "@/lib/sitemaps";
import { SITE_URL } from "@/lib/site";

// SEO and scraper crawlers that bring no visitors. Search engines and AI search crawlers stay allowed.
const BLOCKED_BOTS = [
  "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot",
  "Bytespider", "CCBot", "Diffbot", "Timpibot", "omgili",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard", "/moderation", "/contribute", "/auth/", "/api/", "/*/edit"] },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: (await getSitemapIds()).map((id) => `${SITE_URL}/sitemap/${id}.xml`),
  };
}
