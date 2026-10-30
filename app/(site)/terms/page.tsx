import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of use", description: "The terms for using and contributing to Ethiopian Music DB." };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 7, 2026"
      sections={[
        { h: "What this site is", p: ["Ethiopian Music DB is a free, volunteer-run, open archive of releases, tracks and credits. It is provided “as is”, without warranties of any kind, and its information may be incomplete or wrong."] },
        { h: "Your account", p: ["You must give a valid email address and keep your login secure. You are responsible for activity on your account. We may suspend or remove accounts that break these terms."] },
        { h: "What you may contribute", p: ["Contribute factual information you believe is accurate: titles, names, credits, years, formats and links. Do not submit spam, deliberately false data, harassment, or private information about people. Do not copy long passages of copyrighted text such as full liner-note essays or lyrics, and do not link to infringing material."] },
        { h: "Licence for your contributions", p: ["By submitting data you confirm that you have the right to share it, and you dedicate it to the public domain under CC0 1.0 (see the Data licence page). Contributions are linked to your account for moderation purposes and may be attributed to your username."] },
        { h: "Moderation", p: ["Moderators may edit, lock, revert or remove content and decide edit proposals at their discretion. Locked records are treated as reviewed and can only be changed by moderators."] },
        { h: "Third-party content and links", p: ["Cover images are YouTube thumbnails and remain the property of their owners. Links to YouTube, Spotify and other services lead to sites we do not control. We are not affiliated with any artist, label or service listed here."] },
        { h: "Copyright and corrections", p: [`If you believe something here infringes your rights or is inaccurate about you, write to ${CONTACT_EMAIL} with the page address and details and we will review it promptly.`] },
        { h: "Liability and changes", p: ["To the extent permitted by law, we are not liable for losses from using the site. We may update these terms; continuing to use the site means you accept the updated terms."] },
      ]}
    />
  );
}
