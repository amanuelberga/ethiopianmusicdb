import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Data licence", description: "The catalogue data is released under CC0; what that covers and what it does not." };

export default function DataLicensePage() {
  return (
    <LegalPage
      title="Data licence"
      updated="October 7, 2026"
      sections={[
        { h: "Catalogue data is CC0", p: ["Unless noted otherwise, the factual catalogue data on this site (titles, names, credits, years, formats, links and the relationships between them) is released under the Creative Commons CC0 1.0 Universal public-domain dedication (creativecommons.org/publicdomain/zero/1.0). You may copy, modify and use it, including commercially, without asking and without giving credit. Credit is appreciated."] },
        { h: "What is not covered", p: ["Cover images and thumbnails belong to their rights holders. Names, logos and trademarks of artists, labels and services remain theirs. Free-text notes added by contributors are submitted under the same CC0 dedication."] },
        { h: "Imported data", p: ["Part of the catalogue was seeded from the monthly Discogs data dumps, which Discogs releases under CC0. Imported records are marked “Imported from Discogs” and link back to the matching Discogs page. Because Discogs records are often incomplete, imported records are left unlocked so contributors can improve them. We are not affiliated with or endorsed by Discogs."] },
        { h: "Source code", p: ["The website code is licensed separately; see the LICENSE file in the code repository."] },
        { h: "Using the data responsibly", p: [`Please be gentle with the servers. Bulk downloads are not offered yet; write to ${CONTACT_EMAIL} to ask for an export.`] },
      ]}
    />
  );
}
