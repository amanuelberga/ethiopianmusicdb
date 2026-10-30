import Link from "next/link";
import { EnvVarWarning } from "@/components/env-var-warning";
import { SearchBox } from "@/components/search-box";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserNav } from "@/components/user-nav";
import { hasEnvVars } from "@/lib/utils";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Fixed colours, the same in light and dark mode: see --header-* in app/globals.css */}
      <header className="site-header">
        {/* Top row: name, search, account. Second row: site sections. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <Link href="/" className="whitespace-nowrap text-xl font-extrabold tracking-tight">Ethiopian Music DB</Link>
          <SearchBox />
          {!hasEnvVars ? <EnvVarWarning /> : <UserNav />}
        </div>
        <nav aria-label="Sections" className="border-t border-[hsl(var(--header-divider))]">
          <div className="mx-auto flex max-w-5xl gap-6 px-5 py-2.5 font-semibold">
            <Link href="/artists" className="whitespace-nowrap hover:underline">Artists</Link>
            <Link href="/releases" className="whitespace-nowrap hover:underline">Releases</Link>
            <Link href="/contribute" prefetch={false} className="whitespace-nowrap hover:underline">Contribute</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-5">{children}</main>
      <footer className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t px-5 py-8 text-xs">
        <p>
          Open, user-contributed archive of Ethiopian music. Some records imported from{" "}
          <a href="https://www.discogs.com/data/" target="_blank" rel="noreferrer" className="underline">Discogs</a> (CC0).
        </p>
        <nav className="flex gap-4">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/data-license" className="hover:underline">Data licence</Link>
          <Link href="/about-data" className="hover:underline">About the data</Link>
        </nav>
        <ThemeSwitcher />
      </footer>
    </div>
  );
}
