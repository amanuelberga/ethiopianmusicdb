import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", description: "What Ethiopian Music DB stores about you and why." };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 7, 2026"
      sections={[
        { h: "What we collect", p: ["Account data: your email address, an optional username and your role. Contributions: the releases, artists, credits and edit proposals you submit, linked to your account. Technical data: standard server logs, such as IP address and browser type, kept by our hosting provider."] },
        { h: "What is public", p: ["Catalogue data is public. Usernames and roles are publicly readable by design, and each contribution records the account that created it, so a contribution can be linked to a username. Your email address is never shown publicly."] },
        { h: "Cookies", p: ["We use only the cookies needed to keep you signed in. We do not use advertising or analytics cookies. Our sign-in bot protection (Cloudflare Turnstile) may use its own technical cookies or storage to work."] },
        { h: "The liner-note scanner", p: ["Photos you scan are processed entirely in your browser. They are not uploaded, stored or sent to us. The first time you use the scanner it downloads language data files from a public content network."] },
        { h: "Services that process data for us", p: ["Supabase (database and sign-in), Vercel (hosting), Cloudflare Turnstile (bot protection at sign-up and sign-in) and our email provider (confirmation and password-reset emails)."] },
        { h: "Keeping and deleting data", p: ["We keep your account until you ask us to delete it. When an account is deleted, its email and profile are removed and its contributions stay in the catalogue without your account attached."] },
        { h: "Your rights and contact", p: [`Write to ${CONTACT_EMAIL} to see, correct or delete your data. This site is not intended for children under 13.`] },
        { h: "Changes", p: ["We may update this policy. The date at the top shows the latest version."] },
      ]}
    />
  );
}
