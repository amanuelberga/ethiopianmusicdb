# Ethiopian Music DB

An open, user-contributed, bilingual (English / Amharic-Ge'ez) database of Ethiopian music: artists, releases,
tracklists, labels and credits, in the spirit of Discogs and MusicBrainz.

Anyone can browse. Signed-in contributors can add releases and artists and edit their own unlocked records; other
changes are submitted as edit proposals that moderators review. Records that moderators have checked can be locked
as canonical. Releases can be grouped as editions of one main release, can carry streaming links, and can be
prefilled from a YouTube Music album or playlist link.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, Cache Components), React, Tailwind CSS, a few shadcn/ui components
- [Supabase](https://supabase.com) (Postgres with row-level security, and Auth)
- Cloudflare Turnstile CAPTCHA on sign-up and login
- tesseract.js for the in-browser liner-note scanner (photos and scanned text never leave the browser)
- Hosted on Vercel

The database is documented in [docs/database-design.md](docs/database-design.md) (tables, permission model, limits
and design decisions). [docs/schema.sql](docs/schema.sql) recreates the full schema, including row-level security
policies and functions, in an empty Supabase project; it is consolidated from the project's migrations, and the live
database is the source of truth.

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own values:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (never use a secret or service-role key) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (the secret key is configured in Supabase Auth) |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the site, used for canonical URLs, the sitemap and OG images |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional contact address shown on the legal pages |
| `CRON_SECRET` | Server-only secret that protects the `/api/keepalive` cron route |
| `YOUTUBE_API_KEY` | Optional, server-only YouTube Data API v3 key for "Fill from a YouTube Music link"; without it the import is turned off |

`NEXT_PUBLIC_` values are built into the client bundle, so they must never hold secrets.

## Run and build

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build, includes type checking
npm run lint
```

The build reads from the Supabase database to prerender the cached pages, so the environment variables must be set
at build time.

## Caching

Public pages (home, browse lists, release, artist, label and role pages) are cached for up to a few hours. Edits made
on the site clear the affected pages straight away. Changes made directly in the database (for example in the
Supabase SQL editor) only appear when the cache expires, unless an admin uses **Clear all caches** on `/dashboard`.

`npm run dev` does not cache. To check caching locally, run `npm run build && npm start`; a response header
`x-nextjs-cache: HIT` means the page came from the cache.

## Licences

- **Code:** MIT, see [LICENSE](LICENSE).
- **Catalogue data:** CC0 1.0 (public domain), see `/data-license` on the site.
- Part of the catalogue was imported from the [Discogs](https://www.discogs.com/data/) monthly data dumps (CC0); see
  `/about-data` on the site. This project is not affiliated with or endorsed by Discogs.
