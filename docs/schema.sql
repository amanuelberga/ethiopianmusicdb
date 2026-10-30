-- =====================================================================================================
-- Ethiopian Music DB: consolidated database schema
--
-- Recreates the final schema in an EMPTY hosted Supabase project (it relies on the auth schema, auth.uid()
-- and the anon / authenticated / service_role roles). Each object appears once, in its final version.
-- No seed or user data is included (the starter list of official credit roles is described in
-- docs/database-design.md). Run it once, as the project owner (for example in the SQL editor).
--
-- Order: extensions, types, tables (with constraints), indexes, functions, triggers, row-level security and
-- policies, function and table privileges.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------------------------------
-- 2. Types
-- -----------------------------------------------------------------------------------------------------
CREATE TYPE user_role      AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE release_type   AS ENUM ('Album', 'Single', 'EP', 'Compilation');
CREATE TYPE release_format AS ENUM ('Cassette', 'Vinyl', 'CD', 'Digital', 'Other');
CREATE TYPE entity_type    AS ENUM ('Person', 'Group', 'Organization');
CREATE TYPE credit_scope   AS ENUM ('release', 'track', 'both');
CREATE TYPE review_status  AS ENUM ('pending', 'approved', 'rejected');

-- -----------------------------------------------------------------------------------------------------
-- 3. Tables
-- The len_* / fmt_* checks were added to the live database as NOT VALID (existing rows not re-checked);
-- here they are ordinary checks because the tables start empty.
-- -----------------------------------------------------------------------------------------------------

-- One row per signed-in account, created by the on_auth_user_created trigger.
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT,
  role       user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_.-]{3,30}$')
);

CREATE TABLE labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en    TEXT NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_am    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_locked  BOOLEAN NOT NULL DEFAULT false,
  source     TEXT,
  source_id  TEXT,
  CONSTRAINT len_name_en CHECK (char_length(name_en) <= 500),
  CONSTRAINT len_name_am CHECK (char_length(name_am) <= 500)
);

-- People, groups and organizations (for example studios).
CREATE TABLE artists (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en           TEXT NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_am           TEXT,
  sort_name         TEXT,
  entity_type       entity_type NOT NULL DEFAULT 'Person',
  bio_en            TEXT,
  bio_am            TEXT,
  begin_year        SMALLINT CHECK (begin_year BETWEEN 1800 AND 2100),
  end_year          SMALLINT CHECK (end_year   BETWEEN 1800 AND 2100),
  profile_image_key TEXT,
  merged_into       UUID REFERENCES artists(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_locked         BOOLEAN NOT NULL DEFAULT false,
  source            TEXT,
  source_id         TEXT,
  CONSTRAINT len_name_en           CHECK (char_length(name_en) <= 500),
  CONSTRAINT len_name_am           CHECK (char_length(name_am) <= 500),
  CONSTRAINT len_sort_name         CHECK (char_length(sort_name) <= 500),
  CONSTRAINT len_bio_en            CHECK (char_length(bio_en) <= 5000),
  CONSTRAINT len_bio_am            CHECK (char_length(bio_am) <= 5000),
  CONSTRAINT len_profile_image_key CHECK (char_length(profile_image_key) <= 500)
);

CREATE TABLE artist_aliases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id  UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  alias      TEXT NOT NULL CHECK (length(btrim(alias)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  CONSTRAINT len_alias CHECK (char_length(alias) <= 500)
);

CREATE TABLE group_members (
  group_id   UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  begin_year SMALLINT,
  end_year   SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (group_id, member_id),
  CHECK (group_id <> member_id)
);

-- Each row is one specific edition / format. edition_of links an edition to its main release.
CREATE TABLE releases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en         TEXT NOT NULL CHECK (length(btrim(title_en)) > 0),
  title_am         TEXT,
  release_year     SMALLINT CHECK (release_year BETWEEN 1900 AND 2100),
  release_year_ec  SMALLINT CHECK (release_year_ec BETWEEN 1890 AND 2100),
  label_id         UUID REFERENCES labels(id) ON DELETE SET NULL,
  catalog_number   TEXT,
  type             release_type   NOT NULL DEFAULT 'Album',
  format           release_format NOT NULL DEFAULT 'Digital',
  cover_key        TEXT,
  youtube_video_id TEXT,
  streaming_links  JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(streaming_links) = 'object'),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_locked        BOOLEAN NOT NULL DEFAULT false,
  source           TEXT,
  source_id        TEXT,
  source_quality   TEXT,
  edition_of       UUID REFERENCES releases(id) ON DELETE SET NULL,
  CONSTRAINT releases_edition_not_self CHECK (edition_of IS NULL OR edition_of <> id),
  CONSTRAINT len_title_en         CHECK (char_length(title_en) <= 1000),
  CONSTRAINT len_title_am         CHECK (char_length(title_am) <= 1000),
  CONSTRAINT len_catno            CHECK (char_length(catalog_number) <= 200),
  CONSTRAINT len_notes            CHECK (char_length(notes) <= 5000),
  CONSTRAINT len_streaming_links  CHECK (pg_column_size(streaming_links) <= 8192),
  CONSTRAINT fmt_youtube_video_id CHECK (youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  CONSTRAINT len_cover_key        CHECK (char_length(cover_key) <= 500)
);

-- Reserved for uploaded cover images; not used by the application.
CREATE TABLE release_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('front','back','inlay','label','other')),
  position   SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

-- The names printed on the cover, in order.
CREATE TABLE release_artists (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  artist_id  UUID NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  position   SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (release_id, artist_id)
);

CREATE TABLE tracks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id       UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  disc_number      SMALLINT NOT NULL DEFAULT 1 CHECK (disc_number > 0),
  side             TEXT NOT NULL DEFAULT '' CHECK (side ~ '^[A-Z]?$'),
  position         SMALLINT NOT NULL CHECK (position > 0),
  title_en         TEXT NOT NULL CHECK (length(btrim(title_en)) > 0),
  title_am         TEXT,
  duration_seconds INT CHECK (duration_seconds > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracks_position_unique UNIQUE (release_id, disc_number, side, position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT len_title_en CHECK (char_length(title_en) <= 1000),
  CONSTRAINT len_title_am CHECK (char_length(title_am) <= 1000)
);

-- Performers and featured artists of a track (when they differ from the release artists).
CREATE TABLE track_artists (
  track_id    UUID NOT NULL REFERENCES tracks(id)  ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  position    SMALLINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (track_id, artist_id)
);

CREATE TABLE credit_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_en    TEXT NOT NULL CHECK (length(btrim(role_en)) > 0),
  role_am    TEXT,
  scope      credit_scope NOT NULL DEFAULT 'both',
  is_custom  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  CONSTRAINT len_role_en CHECK (char_length(role_en) <= 200),
  CONSTRAINT len_role_am CHECK (char_length(role_am) <= 200)
);

CREATE TABLE release_credits (
  release_id  UUID NOT NULL REFERENCES releases(id)     ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES artists(id)      ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES credit_roles(id) ON DELETE RESTRICT,
  credited_as TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (release_id, artist_id, role_id),
  CONSTRAINT len_credit_text CHECK (char_length(notes) <= 1000 AND char_length(credited_as) <= 500)
);

CREATE TABLE track_credits (
  track_id    UUID NOT NULL REFERENCES tracks(id)       ON DELETE CASCADE,
  artist_id   UUID NOT NULL REFERENCES artists(id)      ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES credit_roles(id) ON DELETE RESTRICT,
  credited_as TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (track_id, artist_id, role_id),
  CONSTRAINT len_credit_text CHECK (char_length(notes) <= 1000 AND char_length(credited_as) <= 500)
);

CREATE TABLE edit_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table     TEXT NOT NULL,
  target_id        UUID NOT NULL,
  submitted_by     UUID NOT NULL DEFAULT auth.uid(),
  submitter_notes  TEXT,
  proposed_changes JSONB,
  status           review_status NOT NULL DEFAULT 'pending',
  admin_notes      TEXT,
  reviewed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT edit_proposals_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT edit_proposals_target_table_check
    CHECK (target_table IN ('releases','artists','labels','tracks','release_content','artist_content')),
  CHECK (status <> 'pending' OR proposed_changes IS NOT NULL),
  CONSTRAINT len_notes   CHECK (char_length(submitter_notes) <= 2000 AND char_length(admin_notes) <= 2000),
  CONSTRAINT len_payload CHECK (proposed_changes IS NULL OR pg_column_size(proposed_changes) <= 1000000)
);

-- Counter for the "Fill from a YouTube Music link" import; only consume_import_quota() touches it.
CREATE TABLE import_calls (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id   UUID NOT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------------------------------
-- 4. Indexes
-- (primary-key prefixes already cover lookups by release_id / track_id / group_id)
-- -----------------------------------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_profiles_username      ON profiles (lower(username));
CREATE UNIQUE INDEX idx_artist_aliases_unique  ON artist_aliases (artist_id, lower(alias));
CREATE UNIQUE INDEX idx_unique_role_en         ON credit_roles (lower(role_en));
CREATE UNIQUE INDEX idx_releases_source        ON releases (source, source_id) WHERE source IS NOT NULL;
CREATE UNIQUE INDEX idx_artists_source         ON artists  (source, source_id) WHERE source IS NOT NULL;
CREATE UNIQUE INDEX idx_labels_source          ON labels   (source, source_id) WHERE source IS NOT NULL;

CREATE INDEX idx_releases_label_id        ON releases (label_id);
CREATE INDEX idx_releases_year            ON releases (release_year);
CREATE INDEX idx_releases_edition_of      ON releases (edition_of) WHERE edition_of IS NOT NULL;
CREATE INDEX idx_release_artists_artist   ON release_artists (artist_id);
CREATE INDEX idx_release_images_release   ON release_images (release_id);
CREATE INDEX idx_track_artists_artist     ON track_artists (artist_id);
CREATE INDEX idx_release_credits_artist   ON release_credits (artist_id);
CREATE INDEX idx_release_credits_role     ON release_credits (role_id);
CREATE INDEX idx_track_credits_artist     ON track_credits (artist_id);
CREATE INDEX idx_track_credits_role       ON track_credits (role_id);
CREATE INDEX idx_group_members_member     ON group_members (member_id);
CREATE INDEX idx_edit_proposals_submitter ON edit_proposals (submitted_by);
CREATE INDEX idx_edit_proposals_target    ON edit_proposals (target_table, target_id);
CREATE INDEX idx_edit_proposals_pending   ON edit_proposals (created_at) WHERE status = 'pending';
CREATE INDEX idx_tracks_creator_time          ON tracks (created_by, created_at);
CREATE INDEX idx_release_credits_creator_time ON release_credits (created_by, created_at);
CREATE INDEX idx_track_credits_creator_time   ON track_credits (created_by, created_at);
CREATE INDEX idx_import_calls_user_time       ON import_calls (user_id, called_at);

-- Search (trigram)
CREATE INDEX idx_artists_name_en_trgm   ON artists        USING GIN (name_en  gin_trgm_ops);
CREATE INDEX idx_artists_name_am_trgm   ON artists        USING GIN (name_am  gin_trgm_ops);
CREATE INDEX idx_aliases_alias_trgm     ON artist_aliases USING GIN (alias    gin_trgm_ops);
CREATE INDEX idx_releases_title_en_trgm ON releases       USING GIN (title_en gin_trgm_ops);
CREATE INDEX idx_releases_title_am_trgm ON releases       USING GIN (title_am gin_trgm_ops);
CREATE INDEX idx_tracks_title_en_trgm   ON tracks         USING GIN (title_en gin_trgm_ops);
CREATE INDEX idx_tracks_title_am_trgm   ON tracks         USING GIN (title_am gin_trgm_ops);
CREATE INDEX idx_labels_name_en_trgm    ON labels         USING GIN (name_en  gin_trgm_ops);
CREATE INDEX idx_roles_role_en_trgm     ON credit_roles   USING GIN (role_en  gin_trgm_ops);

-- -----------------------------------------------------------------------------------------------------
-- 5. Functions
-- -----------------------------------------------------------------------------------------------------

-- 5.1 Permission helpers (report on the caller only)
CREATE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE FUNCTION is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'));
$$;

CREATE FUNCTION can_edit_release(rel_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_staff() OR EXISTS (
    SELECT 1 FROM releases
    WHERE id = rel_id AND NOT is_locked AND created_by = auth.uid()
  );
$$;

CREATE FUNCTION can_edit_artist(art_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_staff() OR EXISTS (
    SELECT 1 FROM artists
    WHERE id = art_id AND NOT is_locked AND created_by = auth.uid()
  );
$$;

CREATE FUNCTION can_edit_track(trk_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tracks WHERE id = trk_id AND can_edit_release(release_id)
  );
$$;

-- 5.2 Trigger functions
-- New auth user -> profile (a taken or empty username becomes NULL; the user can pick one later)
CREATE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT := NULLIF(btrim(NEW.raw_user_meta_data->>'username'), '');
BEGIN
  IF uname IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE lower(username) = lower(uname)) THEN
    uname := NULL;
  END IF;
  INSERT INTO profiles (id, username) VALUES (NEW.id, uname);
  RETURN NEW;
END;
$$;

-- Only admins may change a profile's role
CREATE FUNCTION protect_profile_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Bump the parent release when a child row changes (SECURITY DEFINER so RLS can't block it)
CREATE FUNCTION touch_release_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE releases SET updated_at = now()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.release_id ELSE NEW.release_id END;
  RETURN NULL;
END;
$$;

CREATE FUNCTION touch_release_from_track() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE releases SET updated_at = now()
  WHERE id = (SELECT release_id FROM tracks
              WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.track_id ELSE NEW.track_id END);
  RETURN NULL;
END;
$$;

-- When a proposal is resolved: clear its payload and stamp the reviewer
CREATE FUNCTION resolve_edit_proposal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('approved','rejected') AND OLD.status = 'pending' THEN
    NEW.proposed_changes = NULL;
    NEW.reviewed_by = auth.uid();
    NEW.reviewed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Daily cap per user: TG_ARGV[0] = limit, TG_ARGV[1] = owner column. Staff and the service role are exempt.
CREATE FUNCTION enforce_daily_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); n INT;
BEGIN
  IF uid IS NULL OR is_staff() THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1 AND created_at > now() - interval ''24 hours''', TG_TABLE_NAME, TG_ARGV[1])
    INTO n USING uid;
  IF n >= TG_ARGV[0]::int THEN
    RAISE EXCEPTION 'Daily limit reached: you can add at most % new % per 24 hours. Please try again tomorrow.', TG_ARGV[0], TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;

-- Only staff and the service role may set is_locked, source*, merged_into
CREATE FUNCTION protect_system_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_staff() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_locked := false;
    NEW.source := NULL;
    NEW.source_id := NULL;
    IF TG_TABLE_NAME = 'releases' THEN NEW.source_quality := NULL; END IF;
    IF TG_TABLE_NAME = 'artists'  THEN NEW.merged_into := NULL; END IF;
  ELSE
    NEW.is_locked := OLD.is_locked;
    NEW.source := OLD.source;
    NEW.source_id := OLD.source_id;
    IF TG_TABLE_NAME = 'releases' THEN NEW.source_quality := OLD.source_quality; END IF;
    IF TG_TABLE_NAME = 'artists'  THEN NEW.merged_into := OLD.merged_into; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Only staff and the service role may set or change releases.edition_of
CREATE FUNCTION protect_edition_of() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.edition_of IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.edition_of IS DISTINCT FROM OLD.edition_of) THEN
    IF auth.uid() IS NOT NULL AND NOT is_staff() THEN
      RAISE EXCEPTION 'Only staff can link editions';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- created_at cannot be set or changed by ordinary users (keeps the daily caps honest)
CREATE FUNCTION force_created_at() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_staff() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); ELSE NEW.created_at := OLD.created_at; END IF;
  RETURN NEW;
END $$;

-- Per-parent row cap: TG_ARGV[0] = parent column, [1] = limit, [2] = wording for the error message
CREATE FUNCTION enforce_child_cap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n BIGINT;
BEGIN
  IF auth.uid() IS NULL OR is_staff() THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', TG_TABLE_NAME, TG_ARGV[0])
    INTO n USING (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF n >= TG_ARGV[1]::bigint THEN
    RAISE EXCEPTION 'Limit reached: at most % % are allowed.', TG_ARGV[1], TG_ARGV[2];
  END IF;
  RETURN NEW;
END $$;

-- 5.3 Search (English names and titles; editions and merged artists are left out)
CREATE FUNCTION search_all(q TEXT, max_results INT DEFAULT 20)
RETURNS TABLE (entity TEXT, entity_id UUID, label TEXT, sublabel TEXT, score REAL)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH n AS (SELECT btrim(q) AS q WHERE char_length(btrim(q)) BETWEEN 2 AND 100),
  hits AS (
    SELECT 'artist'::text AS entity, a.id AS entity_id, a.name_en AS label, a.name_am AS sublabel,
           similarity(a.name_en, n.q) AS score
      FROM artists a, n
      WHERE a.merged_into IS NULL AND (a.name_en ILIKE '%' || n.q || '%' OR a.name_en % n.q)
    UNION ALL
    SELECT 'artist', a.id, a.name_en, al.alias, similarity(al.alias, n.q)
      FROM artist_aliases al JOIN artists a ON a.id = al.artist_id, n
      WHERE a.merged_into IS NULL AND (al.alias ILIKE '%' || n.q || '%' OR al.alias % n.q)
    UNION ALL
    SELECT 'release', r.id, r.title_en, r.release_year::text, similarity(r.title_en, n.q)
      FROM releases r, n
      WHERE r.edition_of IS NULL AND (r.title_en ILIKE '%' || n.q || '%' OR r.title_en % n.q)
    UNION ALL
    SELECT 'track', t.id, t.title_en, r.title_en, similarity(t.title_en, n.q)
      FROM tracks t JOIN releases r ON r.id = t.release_id, n
      WHERE r.edition_of IS NULL AND (t.title_en ILIKE '%' || n.q || '%' OR t.title_en % n.q)
    UNION ALL
    SELECT 'label', l.id, l.name_en, l.name_am, similarity(l.name_en, n.q)
      FROM labels l, n
      WHERE l.name_en ILIKE '%' || n.q || '%' OR l.name_en % n.q
    UNION ALL
    SELECT 'role', c.id, c.role_en, c.role_am, similarity(c.role_en, n.q)
      FROM credit_roles c, n
      WHERE c.role_en ILIKE '%' || n.q || '%' OR c.role_en % n.q
  )
  SELECT d.entity, d.entity_id, d.label, d.sublabel, d.score
  FROM (SELECT DISTINCT ON (entity, entity_id) * FROM hits ORDER BY entity, entity_id, score DESC) d
  ORDER BY d.score DESC, d.label
  LIMIT least(greatest(coalesce(max_results, 20), 1), 60);
$$;

-- 5.4 Name resolution and content helpers (SECURITY INVOKER: row-level security applies)
-- Find an artist by English name, Amharic name or alias; create one if none matches.
CREATE FUNCTION resolve_artist(p_en TEXT, p_am TEXT, p_type entity_type DEFAULT 'Person') RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_en TEXT := NULLIF(btrim(p_en), ''); v_am TEXT := NULLIF(btrim(p_am), ''); v_id UUID;
BEGIN
  v_en := COALESCE(v_en, v_am);
  IF v_en IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM artists
   WHERE merged_into IS NULL AND (lower(name_en) = lower(v_en) OR (v_am IS NOT NULL AND name_am = v_am)) LIMIT 1;
  IF v_id IS NULL THEN
    SELECT a.id INTO v_id FROM artist_aliases al JOIN artists a ON a.id = al.artist_id
     WHERE a.merged_into IS NULL AND lower(al.alias) = lower(v_en) LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO artists (name_en, name_am, entity_type) VALUES (v_en, v_am, p_type) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- Find a credit role by English name; unknown names become custom roles for moderators to review.
CREATE FUNCTION resolve_role(p_name TEXT) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM credit_roles WHERE lower(role_en) = lower(btrim(p_name));
  IF v_id IS NULL THEN
    INSERT INTO credit_roles (role_en, scope, is_custom) VALUES (btrim(p_name), 'both', true) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION add_credits(p_credits JSONB, p_release UUID, p_track UUID) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c JSONB; p JSONB; a UUID; r UUID; n TEXT; ca TEXT; et entity_type;
BEGIN
  FOR c IN SELECT value FROM jsonb_array_elements(COALESCE(p_credits, '[]'::jsonb)) LOOP
    r := resolve_role(c->>'role');
    n := NULLIF(btrim(c->>'notes'), '');
    et := CASE WHEN lower(c->>'role') LIKE '%studio%' THEN 'Organization'::entity_type ELSE 'Person'::entity_type END;
    FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(c->'people', '[]'::jsonb)) LOOP
      a := resolve_artist(p->>'name_en', p->>'name_am', et);
      CONTINUE WHEN a IS NULL;
      ca := NULLIF(btrim(p->>'credited_as'), '');
      IF p_track IS NULL THEN
        INSERT INTO release_credits (release_id, artist_id, role_id, credited_as, notes) VALUES (p_release, a, r, ca, n) ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO track_credits (track_id, artist_id, role_id, credited_as, notes) VALUES (p_track, a, r, ca, n) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION add_track_artists(p_track UUID, p_performers JSONB, p_featured JSONB) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p JSONB; a UUID; pos INT := 0;
BEGIN
  FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(p_performers, '[]'::jsonb)) LOOP
    a := resolve_artist(p->>'name_en', p->>'name_am');
    CONTINUE WHEN a IS NULL;
    pos := pos + 1;
    INSERT INTO track_artists (track_id, artist_id, is_featured, position) VALUES (p_track, a, false, pos) ON CONFLICT DO NOTHING;
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(p_featured, '[]'::jsonb)) LOOP
    a := resolve_artist(p->>'name_en', p->>'name_am');
    CONTINUE WHEN a IS NULL;
    pos := pos + 1;
    INSERT INTO track_artists (track_id, artist_id, is_featured, position) VALUES (p_track, a, true, pos) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Same title and at least one shared release artist (format and year are ignored).
CREATE FUNCTION find_duplicate_releases(p_title TEXT, p_artists TEXT[])
RETURNS TABLE (id UUID, title_en TEXT, artist_names TEXT, release_year SMALLINT, format release_format, is_locked BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.id, r.title_en,
         (SELECT string_agg(a2.name_en, ', ' ORDER BY ra2.position)
            FROM release_artists ra2 JOIN artists a2 ON a2.id = ra2.artist_id
           WHERE ra2.release_id = r.id),
         r.release_year, r.format, r.is_locked
  FROM releases r
  WHERE lower(r.title_en) = lower(btrim(p_title))
    AND EXISTS (
      SELECT 1 FROM release_artists ra JOIN artists a ON a.id = ra.artist_id
      WHERE ra.release_id = r.id
        AND (lower(a.name_en) IN (SELECT lower(x) FROM unnest(p_artists) AS x)
             OR EXISTS (SELECT 1 FROM artist_aliases al WHERE al.artist_id = a.id
                          AND lower(al.alias) IN (SELECT lower(x) FROM unnest(p_artists) AS x))))
  LIMIT 5;
$$;

-- Create a release with its label, artists, credits, tracks and performers in one call.
CREATE FUNCTION create_release(payload JSONB) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  rel UUID; lbl UUID; trk UUID; a UUID; t JSONB; p JSONB; tpos BIGINT; apos INT := 0;
  lbl_en TEXT := NULLIF(btrim(payload #>> '{label,name_en}'), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NULLIF(btrim(payload->>'title_en'), '') IS NULL THEN RAISE EXCEPTION 'Title is required'; END IF;

  IF lbl_en IS NOT NULL THEN
    SELECT id INTO lbl FROM labels WHERE lower(name_en) = lower(lbl_en) LIMIT 1;
    IF lbl IS NULL THEN
      INSERT INTO labels (name_en, name_am) VALUES (lbl_en, NULLIF(btrim(payload #>> '{label,name_am}'), '')) RETURNING id INTO lbl;
    END IF;
  END IF;

  INSERT INTO releases (title_en, title_am, release_year, release_year_ec, label_id, catalog_number, type, format,
                        youtube_video_id, streaming_links, notes)
  VALUES (btrim(payload->>'title_en'), NULLIF(btrim(payload->>'title_am'), ''),
          NULLIF(payload->>'release_year', '')::smallint, NULLIF(payload->>'release_year_ec', '')::smallint,
          lbl, NULLIF(btrim(payload->>'catalog_number'), ''),
          COALESCE(NULLIF(payload->>'type', ''), 'Album')::release_type,
          COALESCE(NULLIF(payload->>'format', ''), 'Digital')::release_format,
          NULLIF(payload->>'youtube_video_id', ''), COALESCE(payload->'streaming_links', '{}'::jsonb),
          NULLIF(payload->>'notes', ''))
  RETURNING id INTO rel;

  FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'artists', '[]'::jsonb)) LOOP
    a := resolve_artist(p->>'name_en', p->>'name_am');
    CONTINUE WHEN a IS NULL;
    apos := apos + 1;
    INSERT INTO release_artists (release_id, artist_id, position) VALUES (rel, a, apos) ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM add_credits(payload->'credits', rel, NULL);

  FOR t, tpos IN SELECT value, ordinality FROM jsonb_array_elements(COALESCE(payload->'tracks', '[]'::jsonb)) WITH ORDINALITY LOOP
    INSERT INTO tracks (release_id, side, position, title_en, title_am, duration_seconds)
    VALUES (rel, COALESCE(upper(NULLIF(btrim(t->>'side'), '')), ''), tpos, btrim(t->>'title_en'),
            NULLIF(btrim(t->>'title_am'), ''), NULLIF(t->>'duration_seconds', '')::int)
    RETURNING id INTO trk;
    PERFORM add_credits(t->'credits', rel, trk);
    PERFORM add_track_artists(trk, t->'performers', t->'featured');
  END LOOP;

  RETURN rel;
END $$;

-- Replace a release's artists, credits, tracks and performers (keeps the ids of tracks that remain).
CREATE FUNCTION replace_release_content(p_release UUID, p_content JSONB) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  t JSONB; p JSONB; a UUID; tid UUID; tpos BIGINT; apos INT := 0; keep UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT can_edit_release(p_release) THEN RAISE EXCEPTION 'You cannot edit this release'; END IF;

  IF jsonb_typeof(p_content->'artists') = 'array' AND jsonb_array_length(p_content->'artists') > 0 THEN
    DELETE FROM release_artists WHERE release_id = p_release;
    FOR p IN SELECT value FROM jsonb_array_elements(p_content->'artists') LOOP
      a := resolve_artist(p->>'name_en', p->>'name_am');
      CONTINUE WHEN a IS NULL;
      apos := apos + 1;
      INSERT INTO release_artists (release_id, artist_id, position) VALUES (p_release, a, apos) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  DELETE FROM release_credits WHERE release_id = p_release;
  PERFORM add_credits(p_content->'credits', p_release, NULL);

  FOR t, tpos IN SELECT value, ordinality FROM jsonb_array_elements(COALESCE(p_content->'tracks', '[]'::jsonb)) WITH ORDINALITY LOOP
    tid := NULLIF(t->>'id', '')::uuid;
    IF tid IS NOT NULL AND EXISTS (SELECT 1 FROM tracks WHERE id = tid AND release_id = p_release) THEN
      UPDATE tracks SET side = COALESCE(upper(NULLIF(btrim(t->>'side'), '')), ''), position = tpos,
             title_en = btrim(t->>'title_en'), title_am = NULLIF(btrim(t->>'title_am'), ''),
             duration_seconds = NULLIF(t->>'duration_seconds', '')::int
       WHERE id = tid;
      DELETE FROM track_credits WHERE track_id = tid;
    ELSE
      INSERT INTO tracks (release_id, side, position, title_en, title_am, duration_seconds)
      VALUES (p_release, COALESCE(upper(NULLIF(btrim(t->>'side'), '')), ''), tpos, btrim(t->>'title_en'),
              NULLIF(btrim(t->>'title_am'), ''), NULLIF(t->>'duration_seconds', '')::int)
      RETURNING id INTO tid;
    END IF;
    keep := keep || tid;
    IF t->'performers' IS NOT NULL OR t->'featured' IS NOT NULL THEN
      DELETE FROM track_artists WHERE track_id = tid;
      PERFORM add_track_artists(tid, t->'performers', t->'featured');
    END IF;
    PERFORM add_credits(t->'credits', p_release, tid);
  END LOOP;

  DELETE FROM tracks WHERE release_id = p_release AND NOT (id = ANY (keep));
END $$;

-- Replace an artist's aliases and group members. New members must be editable by the caller.
CREATE FUNCTION replace_artist_content(p_artist UUID, p_content JSONB) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a TEXT; p JSONB; m UUID; keep UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT can_edit_artist(p_artist) THEN RAISE EXCEPTION 'You cannot edit this artist'; END IF;

  IF jsonb_typeof(p_content->'aliases') = 'array' THEN
    DELETE FROM artist_aliases WHERE artist_id = p_artist;
    FOR a IN SELECT value #>> '{}' FROM jsonb_array_elements(p_content->'aliases') LOOP
      IF NULLIF(btrim(a), '') IS NOT NULL THEN
        INSERT INTO artist_aliases (artist_id, alias) VALUES (p_artist, btrim(a)) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_content->'members') = 'array' THEN
    FOR p IN SELECT value FROM jsonb_array_elements(p_content->'members') LOOP
      m := resolve_artist(p->>'name_en', p->>'name_am');
      CONTINUE WHEN m IS NULL OR m = p_artist;
      keep := array_append(keep, m);
    END LOOP;
    -- Only members who are no longer listed are removed; members who stay are not touched.
    DELETE FROM group_members WHERE group_id = p_artist AND member_id <> ALL (keep);
    FOREACH m IN ARRAY keep LOOP
      IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_artist AND member_id = m) THEN
        IF NOT can_edit_artist(m) THEN
          RAISE EXCEPTION 'You can only add members you can edit. Submit this change as a proposal so a moderator can review it.';
        END IF;
        INSERT INTO group_members (group_id, member_id) VALUES (p_artist, m) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END $$;

-- 5.5 Moderation (SECURITY DEFINER; each checks is_staff() first)
-- Apply a pending proposal: whitelisted columns only, values cast by jsonb_populate_record.
CREATE FUNCTION apply_edit_proposal(p_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prop        edit_proposals%ROWTYPE;
  allowed     TEXT[];
  k           TEXT;
  set_clause  TEXT := '';
  affected    INT;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only moderators or admins can apply proposals';
  END IF;

  SELECT * INTO prop FROM edit_proposals WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or already resolved', p_id;
  END IF;

  IF prop.proposed_changes IS NULL OR jsonb_typeof(prop.proposed_changes) <> 'object' THEN
    RAISE EXCEPTION 'proposed_changes must be a JSON object';
  END IF;

  -- Full tracklist / credits proposals are applied by replace_release_content
  IF prop.target_table = 'release_content' THEN
    PERFORM replace_release_content(prop.target_id, prop.proposed_changes);
    UPDATE edit_proposals SET status = 'approved', admin_notes = p_notes WHERE id = p_id;
    RETURN;
  END IF;

  IF prop.target_table = 'artist_content' THEN
    PERFORM replace_artist_content(prop.target_id, prop.proposed_changes);
    UPDATE edit_proposals SET status = 'approved', admin_notes = p_notes WHERE id = p_id;
    RETURN;
  END IF;

  allowed := CASE prop.target_table
    WHEN 'releases' THEN ARRAY['title_en','title_am','release_year','release_year_ec','label_id',
                               'catalog_number','type','format','cover_key','youtube_video_id',
                               'streaming_links','notes']
    WHEN 'artists'  THEN ARRAY['name_en','name_am','sort_name','entity_type','bio_en','bio_am',
                               'begin_year','end_year','profile_image_key']
    WHEN 'labels'   THEN ARRAY['name_en','name_am']
    WHEN 'tracks'   THEN ARRAY['disc_number','side','position','title_en','title_am','duration_seconds']
  END;

  FOR k IN SELECT jsonb_object_keys(prop.proposed_changes) LOOP
    IF k = ANY (allowed) THEN
      set_clause := set_clause || format('%1$I = r.%1$I, ', k);
    ELSE
      RAISE EXCEPTION 'Column "%" cannot be edited through proposals', k;
    END IF;
  END LOOP;

  IF set_clause = '' THEN
    RAISE EXCEPTION 'Proposal contains no changes';
  END IF;
  set_clause := left(set_clause, -2);

  EXECUTE format(
    'UPDATE public.%1$I AS t SET %2$s
       FROM jsonb_populate_record(NULL::public.%1$I, $1) AS r
      WHERE t.id = $2',
    prop.target_table, set_clause
  ) USING prop.proposed_changes, prop.target_id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RAISE EXCEPTION 'Target % in % no longer exists', prop.target_id, prop.target_table;
  END IF;

  -- The resolve trigger clears proposed_changes and stamps reviewed_by / reviewed_at
  UPDATE edit_proposals SET status = 'approved', admin_notes = p_notes WHERE id = p_id;
END;
$$;

CREATE FUNCTION reject_edit_proposal(p_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only moderators or admins can reject proposals';
  END IF;

  UPDATE edit_proposals SET status = 'rejected', admin_notes = p_notes
   WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or already resolved', p_id;
  END IF;
END;
$$;

-- Move everything from p_source to p_target; the source stays as a redirect stub (merged_into).
CREATE FUNCTION merge_artists(p_source UUID, p_target UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  src artists%ROWTYPE;
  tgt artists%ROWTYPE;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only moderators or admins can merge artists';
  END IF;
  IF p_source = p_target THEN
    RAISE EXCEPTION 'Cannot merge an artist into itself';
  END IF;

  SELECT * INTO src FROM artists WHERE id = p_source FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source artist not found'; END IF;
  SELECT * INTO tgt FROM artists WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target artist not found'; END IF;

  IF src.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'Source artist was already merged into %', src.merged_into;
  END IF;
  IF tgt.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'Target artist was itself merged into %; merge into that one instead', tgt.merged_into;
  END IF;

  UPDATE release_artists ra SET artist_id = p_target
   WHERE ra.artist_id = p_source
     AND NOT EXISTS (SELECT 1 FROM release_artists x
                      WHERE x.release_id = ra.release_id AND x.artist_id = p_target);
  DELETE FROM release_artists WHERE artist_id = p_source;

  UPDATE track_artists ta SET artist_id = p_target
   WHERE ta.artist_id = p_source
     AND NOT EXISTS (SELECT 1 FROM track_artists x
                      WHERE x.track_id = ta.track_id AND x.artist_id = p_target);
  DELETE FROM track_artists WHERE artist_id = p_source;

  UPDATE release_credits rc SET artist_id = p_target
   WHERE rc.artist_id = p_source
     AND NOT EXISTS (SELECT 1 FROM release_credits x
                      WHERE x.release_id = rc.release_id AND x.role_id = rc.role_id
                        AND x.artist_id = p_target);
  DELETE FROM release_credits WHERE artist_id = p_source;

  UPDATE track_credits tc SET artist_id = p_target
   WHERE tc.artist_id = p_source
     AND NOT EXISTS (SELECT 1 FROM track_credits x
                      WHERE x.track_id = tc.track_id AND x.role_id = tc.role_id
                        AND x.artist_id = p_target);
  DELETE FROM track_credits WHERE artist_id = p_source;

  DELETE FROM group_members
   WHERE (group_id = p_source AND member_id = p_target)
      OR (group_id = p_target AND member_id = p_source);

  UPDATE group_members gm SET group_id = p_target
   WHERE gm.group_id = p_source
     AND NOT EXISTS (SELECT 1 FROM group_members x
                      WHERE x.group_id = p_target AND x.member_id = gm.member_id);
  DELETE FROM group_members WHERE group_id = p_source;

  UPDATE group_members gm SET member_id = p_target
   WHERE gm.member_id = p_source
     AND NOT EXISTS (SELECT 1 FROM group_members x
                      WHERE x.member_id = p_target AND x.group_id = gm.group_id);
  DELETE FROM group_members WHERE member_id = p_source;

  UPDATE artist_aliases aa SET artist_id = p_target
   WHERE aa.artist_id = p_source
     AND NOT EXISTS (SELECT 1 FROM artist_aliases x
                      WHERE x.artist_id = p_target AND lower(x.alias) = lower(aa.alias));
  DELETE FROM artist_aliases WHERE artist_id = p_source;

  IF lower(src.name_en) <> lower(tgt.name_en) THEN
    INSERT INTO artist_aliases (artist_id, alias, created_by)
    VALUES (p_target, src.name_en, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  IF src.name_am IS NOT NULL AND src.name_am IS DISTINCT FROM tgt.name_am THEN
    INSERT INTO artist_aliases (artist_id, alias, created_by)
    VALUES (p_target, src.name_am, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Fill gaps on the target from the source (never overwrite existing data)
  UPDATE artists SET
    name_am           = COALESCE(name_am, src.name_am),
    sort_name         = COALESCE(sort_name, src.sort_name),
    bio_en            = COALESCE(bio_en, src.bio_en),
    bio_am            = COALESCE(bio_am, src.bio_am),
    begin_year        = COALESCE(begin_year, src.begin_year),
    end_year          = COALESCE(end_year, src.end_year),
    profile_image_key = COALESCE(profile_image_key, src.profile_image_key)
   WHERE id = p_target;

  UPDATE artists SET merged_into = p_target WHERE merged_into = p_source;
  UPDATE edit_proposals SET target_id = p_target
   WHERE target_table = 'artists' AND target_id = p_source AND status = 'pending';

  UPDATE artists SET merged_into = p_target WHERE id = p_source;
END;
$$;

-- Move the credits of a (custom) role to another role, then delete it.
CREATE FUNCTION merge_credit_role(p_source UUID, p_target UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only moderators or admins can merge roles'; END IF;
  IF p_source = p_target THEN RAISE EXCEPTION 'Choose a different target role'; END IF;

  UPDATE release_credits rc SET role_id = p_target
   WHERE rc.role_id = p_source
     AND NOT EXISTS (SELECT 1 FROM release_credits x WHERE x.release_id = rc.release_id AND x.artist_id = rc.artist_id AND x.role_id = p_target);
  DELETE FROM release_credits WHERE role_id = p_source;

  UPDATE track_credits tc SET role_id = p_target
   WHERE tc.role_id = p_source
     AND NOT EXISTS (SELECT 1 FROM track_credits x WHERE x.track_id = tc.track_id AND x.artist_id = tc.artist_id AND x.role_id = p_target);
  DELETE FROM track_credits WHERE role_id = p_source;

  DELETE FROM credit_roles WHERE id = p_source;
END $$;

-- 5.6 Editions (one level only: a main release cannot itself be an edition)
CREATE FUNCTION link_release_edition(p_edition UUID, p_main UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Staff only'; END IF;
  IF p_edition = p_main THEN RAISE EXCEPTION 'A release cannot be an edition of itself'; END IF;
  IF EXISTS (SELECT 1 FROM releases WHERE id = p_main AND edition_of IS NOT NULL) THEN
    RAISE EXCEPTION 'The chosen main release is itself an edition; pick its main release instead';
  END IF;
  IF EXISTS (SELECT 1 FROM releases WHERE edition_of = p_edition) THEN
    RAISE EXCEPTION 'This release already has editions; move them first or unlink them';
  END IF;
  UPDATE releases SET edition_of = p_main WHERE id = p_edition;
END $$;

CREATE FUNCTION unlink_release_edition(p_edition UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Staff only'; END IF;
  UPDATE releases SET edition_of = NULL WHERE id = p_edition;
END $$;

-- Bulk link by Discogs ids: p_pairs = [{"edition":"<discogs id>","main":"<discogs id>"}, ...].
-- Refuses any signed-in caller; for the SQL editor and the service role.
CREATE FUNCTION bulk_link_editions(p_pairs JSONB) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  WITH p AS (SELECT e->>'edition' AS ed, e->>'main' AS mn FROM jsonb_array_elements(p_pairs) e),
  m AS (SELECT ed.id AS ed_id, mn.id AS mn_id
          FROM p JOIN releases ed ON ed.source = 'discogs' AND ed.source_id = p.ed
                 JOIN releases mn ON mn.source = 'discogs' AND mn.source_id = p.mn
         WHERE ed.id <> mn.id AND mn.edition_of IS NULL)
  UPDATE releases r SET edition_of = m.mn_id FROM m WHERE r.id = m.ed_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- 5.7 Import quota for the YouTube link import: 30 calls per user and 800 in total per 24 hours
CREATE FUNCTION consume_import_quota() RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); u INT; g INT;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  DELETE FROM import_calls WHERE called_at < now() - interval '2 days';
  SELECT count(*) INTO u FROM import_calls WHERE user_id = uid AND called_at > now() - interval '24 hours';
  IF u >= 30 THEN RETURN false; END IF;
  SELECT count(*) INTO g FROM import_calls WHERE called_at > now() - interval '24 hours';
  IF g >= 800 THEN RETURN false; END IF;
  INSERT INTO import_calls (user_id) VALUES (uid);
  RETURN true;
END $$;

-- 5.8 Discogs importer (service role only; idempotent by source_id)
CREATE FUNCTION seed_artist(p JSONB) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_en TEXT := NULLIF(btrim(p->>'name_en'), '');
  v_am TEXT := NULLIF(btrim(p->>'name_am'), '');
  v_sid TEXT := NULLIF(p->>'source_id', '');
  names TEXT[]; v_id UUID; m JSONB; mid UUID; al TEXT; is_new BOOLEAN := false;
BEGIN
  v_en := COALESCE(v_en, v_am);
  IF v_en IS NULL THEN RETURN NULL; END IF;

  IF v_sid IS NOT NULL THEN
    SELECT id INTO v_id FROM artists WHERE source = 'discogs' AND source_id = v_sid;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  names := ARRAY(
    SELECT DISTINCT lower(btrim(x))
    FROM unnest(ARRAY[v_en, v_am] || ARRAY(SELECT jsonb_array_elements_text(COALESCE(p->'aliases', '[]'::jsonb)))) AS x
    WHERE NULLIF(btrim(x), '') IS NOT NULL);

  -- adopt an existing, not-yet-linked artist that has this name or alias
  SELECT a.id INTO v_id FROM artists a
   WHERE a.merged_into IS NULL AND a.source_id IS NULL
     AND (lower(a.name_en) = ANY (names) OR lower(COALESCE(a.name_am, '')) = ANY (names)
          OR EXISTS (SELECT 1 FROM artist_aliases x WHERE x.artist_id = a.id AND lower(x.alias) = ANY (names)))
   ORDER BY a.created_at LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF v_sid IS NOT NULL THEN UPDATE artists SET source = 'discogs', source_id = v_sid WHERE id = v_id; END IF;
  ELSE
    INSERT INTO artists (name_en, name_am, entity_type, bio_en, source, source_id, is_locked, created_by)
    VALUES (v_en, v_am, COALESCE(NULLIF(p->>'entity_type', ''), 'Person')::entity_type, NULLIF(btrim(p->>'bio_en'), ''),
            CASE WHEN v_sid IS NOT NULL THEN 'discogs' END, v_sid, false, NULL)
    RETURNING id INTO v_id;
    is_new := true;
  END IF;

  FOR al IN SELECT jsonb_array_elements_text(COALESCE(p->'aliases', '[]'::jsonb)) LOOP
    IF NULLIF(btrim(al), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM artists WHERE id = v_id AND (lower(name_en) = lower(btrim(al)) OR lower(COALESCE(name_am, '')) = lower(btrim(al)))) THEN
      INSERT INTO artist_aliases (artist_id, alias) VALUES (v_id, btrim(al)) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  IF is_new THEN
    FOR m IN SELECT value FROM jsonb_array_elements(COALESCE(p->'members', '[]'::jsonb)) LOOP
      mid := seed_artist(jsonb_build_object('source_id', m->>'source_id', 'name_en', m->>'name_en', 'name_am', m->>'name_am'));
      IF mid IS NOT NULL AND mid <> v_id THEN
        INSERT INTO group_members (group_id, member_id) VALUES (v_id, mid) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION seed_credits(p_credits JSONB, p_release UUID, p_track UUID) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c JSONB; x JSONB; a UUID; r UUID; n TEXT;
BEGIN
  FOR c IN SELECT value FROM jsonb_array_elements(COALESCE(p_credits, '[]'::jsonb)) LOOP
    r := resolve_role(c->>'role');
    n := NULLIF(btrim(c->>'notes'), '');
    FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(c->'people', '[]'::jsonb)) LOOP
      a := seed_artist(x);
      CONTINUE WHEN a IS NULL;
      IF p_track IS NULL THEN
        INSERT INTO release_credits (release_id, artist_id, role_id, credited_as, notes)
        VALUES (p_release, a, r, NULLIF(btrim(x->>'credited_as'), ''), n) ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO track_credits (track_id, artist_id, role_id, credited_as, notes)
        VALUES (p_track, a, r, NULLIF(btrim(x->>'credited_as'), ''), n) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION seed_discogs_release(p JSONB) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  sid TEXT := p->>'source_id';
  rel UUID; lbl UUID; trk UUID; a UUID; t JSONB; x JSONB; tpos BIGINT; pos INT; i INT;
  main_ids UUID[] := ARRAY[]::UUID[];
  lsid TEXT := NULLIF(p->'label'->>'source_id', '');
  lname TEXT := NULLIF(btrim(p->'label'->>'name_en'), '');
BEGIN
  SELECT id INTO rel FROM releases WHERE source = 'discogs' AND source_id = sid;
  IF rel IS NOT NULL THEN RETURN rel; END IF;
  IF NULLIF(btrim(p->>'title_en'), '') IS NULL THEN RAISE EXCEPTION 'title is required'; END IF;

  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p->'artists', '[]'::jsonb)) LOOP
    a := seed_artist(x);
    IF a IS NOT NULL THEN main_ids := main_ids || a; END IF;
  END LOOP;
  IF cardinality(main_ids) = 0 THEN RAISE EXCEPTION 'at least one artist is required'; END IF;

  -- already entered by hand (same title + one of the same artists)? leave that record untouched
  SELECT r.id INTO rel FROM releases r
   WHERE r.source IS NULL AND lower(r.title_en) = lower(btrim(p->>'title_en'))
     AND EXISTS (SELECT 1 FROM release_artists ra WHERE ra.release_id = r.id AND ra.artist_id = ANY (main_ids))
   LIMIT 1;
  IF rel IS NOT NULL THEN RETURN rel; END IF;

  IF lname IS NOT NULL THEN
    IF lsid IS NOT NULL THEN SELECT id INTO lbl FROM labels WHERE source = 'discogs' AND source_id = lsid; END IF;
    IF lbl IS NULL THEN
      SELECT id INTO lbl FROM labels WHERE source_id IS NULL AND lower(name_en) = lower(lname) LIMIT 1;
      IF lbl IS NOT NULL THEN
        IF lsid IS NOT NULL THEN UPDATE labels SET source = 'discogs', source_id = lsid WHERE id = lbl; END IF;
      ELSE
        INSERT INTO labels (name_en, name_am, source, source_id, is_locked, created_by)
        VALUES (lname, NULLIF(btrim(p->'label'->>'name_am'), ''), CASE WHEN lsid IS NOT NULL THEN 'discogs' END, lsid, false, NULL)
        RETURNING id INTO lbl;
      END IF;
    END IF;
  END IF;

  INSERT INTO releases (title_en, title_am, release_year, label_id, catalog_number, type, format, youtube_video_id,
                        notes, source, source_id, source_quality, is_locked, created_by)
  VALUES (btrim(p->>'title_en'), NULLIF(btrim(p->>'title_am'), ''), NULLIF(p->>'release_year', '')::smallint, lbl,
          NULLIF(btrim(p->>'catalog_number'), ''), COALESCE(NULLIF(p->>'type', ''), 'Album')::release_type,
          COALESCE(NULLIF(p->>'format', ''), 'Other')::release_format, NULLIF(p->>'youtube_video_id', ''),
          NULLIF(p->>'notes', ''), 'discogs', sid, NULLIF(p->>'source_quality', ''), false, NULL)
  RETURNING id INTO rel;

  FOR i IN 1 .. cardinality(main_ids) LOOP
    INSERT INTO release_artists (release_id, artist_id, position) VALUES (rel, main_ids[i], i) ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM seed_credits(p->'credits', rel, NULL);

  FOR t, tpos IN SELECT value, ordinality FROM jsonb_array_elements(COALESCE(p->'tracks', '[]'::jsonb)) WITH ORDINALITY LOOP
    INSERT INTO tracks (release_id, side, position, title_en, title_am, duration_seconds)
    VALUES (rel, COALESCE(upper(NULLIF(btrim(t->>'side'), '')), ''), tpos, btrim(t->>'title_en'),
            NULLIF(btrim(t->>'title_am'), ''), NULLIF(t->>'duration_seconds', '')::int)
    RETURNING id INTO trk;

    pos := 0;
    FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(t->'performers', '[]'::jsonb)) LOOP
      a := seed_artist(x); CONTINUE WHEN a IS NULL; pos := pos + 1;
      INSERT INTO track_artists (track_id, artist_id, is_featured, position) VALUES (trk, a, false, pos) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(t->'featured', '[]'::jsonb)) LOOP
      a := seed_artist(x); CONTINUE WHEN a IS NULL; pos := pos + 1;
      INSERT INTO track_artists (track_id, artist_id, is_featured, position) VALUES (trk, a, true, pos) ON CONFLICT DO NOTHING;
    END LOOP;
    PERFORM seed_credits(t->'credits', rel, trk);
  END LOOP;
  RETURN rel;
END $$;

-- -----------------------------------------------------------------------------------------------------
-- 6. Triggers
-- BEFORE triggers on the same table fire in name order: a_force_created_at, cap_children, limit_*, protect_*.
-- -----------------------------------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trigger_protect_profile_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

CREATE TRIGGER set_labels_updated_at   BEFORE UPDATE ON labels   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_artists_updated_at  BEFORE UPDATE ON artists  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_releases_updated_at BEFORE UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tracks_updated_at   BEFORE UPDATE ON tracks   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER touch_release_on_tracks         AFTER INSERT OR UPDATE OR DELETE ON tracks          FOR EACH ROW EXECUTE FUNCTION touch_release_updated_at();
CREATE TRIGGER touch_release_on_release_artist AFTER INSERT OR UPDATE OR DELETE ON release_artists FOR EACH ROW EXECUTE FUNCTION touch_release_updated_at();
CREATE TRIGGER touch_release_on_release_credit AFTER INSERT OR UPDATE OR DELETE ON release_credits FOR EACH ROW EXECUTE FUNCTION touch_release_updated_at();
CREATE TRIGGER touch_release_on_release_image  AFTER INSERT OR UPDATE OR DELETE ON release_images  FOR EACH ROW EXECUTE FUNCTION touch_release_updated_at();
CREATE TRIGGER touch_release_on_track_credit   AFTER INSERT OR UPDATE OR DELETE ON track_credits   FOR EACH ROW EXECUTE FUNCTION touch_release_from_track();
CREATE TRIGGER touch_release_on_track_artist   AFTER INSERT OR UPDATE OR DELETE ON track_artists   FOR EACH ROW EXECUTE FUNCTION touch_release_from_track();

CREATE TRIGGER trigger_resolve_edit_proposal
  BEFORE UPDATE ON edit_proposals
  FOR EACH ROW EXECUTE FUNCTION resolve_edit_proposal();

-- created_at is set by the server for ordinary users
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON releases        FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON artists         FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON labels          FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON credit_roles    FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON edit_proposals  FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON tracks          FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON release_credits FOR EACH ROW EXECUTE FUNCTION force_created_at();
CREATE TRIGGER a_force_created_at BEFORE INSERT OR UPDATE ON track_credits   FOR EACH ROW EXECUTE FUNCTION force_created_at();

-- Daily caps per user (rows created in the last 24 hours)
CREATE TRIGGER limit_releases        BEFORE INSERT ON releases        FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('10',   'created_by');
CREATE TRIGGER limit_artists         BEFORE INSERT ON artists         FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('100',  'created_by');
CREATE TRIGGER limit_labels          BEFORE INSERT ON labels          FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('20',   'created_by');
CREATE TRIGGER limit_edit_proposals  BEFORE INSERT ON edit_proposals  FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('25',   'submitted_by');
CREATE TRIGGER limit_credit_roles    BEFORE INSERT ON credit_roles    FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('20',   'created_by');
CREATE TRIGGER limit_tracks          BEFORE INSERT ON tracks          FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('1500', 'created_by');
CREATE TRIGGER limit_release_credits BEFORE INSERT ON release_credits FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('1500', 'created_by');
CREATE TRIGGER limit_track_credits   BEFORE INSERT ON track_credits   FOR EACH ROW EXECUTE FUNCTION enforce_daily_limit('3000', 'created_by');

-- Per-parent row caps
CREATE TRIGGER cap_children BEFORE INSERT ON tracks          FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('release_id', '500',  'tracks per release');
CREATE TRIGGER cap_children BEFORE INSERT ON release_credits FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('release_id', '1000', 'credits per release');
CREATE TRIGGER cap_children BEFORE INSERT ON release_artists FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('release_id', '50',   'artists per release');
CREATE TRIGGER cap_children BEFORE INSERT ON track_credits   FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('track_id',   '60',   'credits per track');
CREATE TRIGGER cap_children BEFORE INSERT ON track_artists   FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('track_id',   '60',   'performers per track');
CREATE TRIGGER cap_children BEFORE INSERT ON artist_aliases  FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('artist_id',  '100',  'aliases per artist');
CREATE TRIGGER cap_children BEFORE INSERT ON group_members   FOR EACH ROW EXECUTE FUNCTION enforce_child_cap('group_id',   '200',  'members per group');

-- System columns and editions
CREATE TRIGGER protect_system_columns BEFORE INSERT OR UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION protect_system_columns();
CREATE TRIGGER protect_system_columns BEFORE INSERT OR UPDATE ON artists  FOR EACH ROW EXECUTE FUNCTION protect_system_columns();
CREATE TRIGGER protect_system_columns BEFORE INSERT OR UPDATE ON labels   FOR EACH ROW EXECUTE FUNCTION protect_system_columns();
CREATE TRIGGER protect_edition_of     BEFORE INSERT OR UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION protect_edition_of();

-- -----------------------------------------------------------------------------------------------------
-- 7. Row-level security and policies
-- -----------------------------------------------------------------------------------------------------
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_artists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_credits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_proposals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_calls    ENABLE ROW LEVEL SECURITY;  -- no policies: only consume_import_quota() uses it

-- Public read (everything except edit_proposals and import_calls)
CREATE POLICY "Public read" ON profiles        FOR SELECT USING (true);
CREATE POLICY "Public read" ON labels          FOR SELECT USING (true);
CREATE POLICY "Public read" ON artists         FOR SELECT USING (true);
CREATE POLICY "Public read" ON artist_aliases  FOR SELECT USING (true);
CREATE POLICY "Public read" ON group_members   FOR SELECT USING (true);
CREATE POLICY "Public read" ON releases        FOR SELECT USING (true);
CREATE POLICY "Public read" ON release_images  FOR SELECT USING (true);
CREATE POLICY "Public read" ON release_artists FOR SELECT USING (true);
CREATE POLICY "Public read" ON tracks          FOR SELECT USING (true);
CREATE POLICY "Public read" ON track_artists   FOR SELECT USING (true);
CREATE POLICY "Public read" ON credit_roles    FOR SELECT USING (true);
CREATE POLICY "Public read" ON release_credits FOR SELECT USING (true);
CREATE POLICY "Public read" ON track_credits   FOR SELECT USING (true);

-- Core records: insert as yourself; update your own unlocked records (or staff); delete staff only
CREATE POLICY "Insert labels" ON labels FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Update own unlocked labels or staff" ON labels FOR UPDATE TO authenticated
  USING ((created_by = (SELECT auth.uid()) AND NOT is_locked) OR is_staff())
  WITH CHECK ((created_by = (SELECT auth.uid()) AND NOT is_locked) OR is_staff());
CREATE POLICY "Staff delete labels" ON labels FOR DELETE TO authenticated USING (is_staff());

CREATE POLICY "Insert artists" ON artists FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Update own unlocked artists or staff" ON artists FOR UPDATE TO authenticated
  USING ((created_by = (SELECT auth.uid()) AND NOT is_locked) OR is_staff())
  WITH CHECK ((created_by = (SELECT auth.uid()) AND NOT is_locked) OR is_staff());
CREATE POLICY "Staff delete artists" ON artists FOR DELETE TO authenticated USING (is_staff());

CREATE POLICY "Insert releases" ON releases FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Update own unlocked releases or staff" ON releases FOR UPDATE TO authenticated
  USING ((created_by = (SELECT auth.uid()) AND NOT is_locked) OR is_staff())
  WITH CHECK ((created_by = (SELECT auth.uid()) AND NOT is_locked) OR is_staff());
CREATE POLICY "Staff delete releases" ON releases FOR DELETE TO authenticated USING (is_staff());

-- Child and junction rows: permission follows the parent record
CREATE POLICY "Insert tracks" ON tracks FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_release(release_id));
CREATE POLICY "Update tracks" ON tracks FOR UPDATE TO authenticated
  USING (can_edit_release(release_id)) WITH CHECK (can_edit_release(release_id));
CREATE POLICY "Delete tracks" ON tracks FOR DELETE TO authenticated USING (can_edit_release(release_id));

CREATE POLICY "Insert release_artists" ON release_artists FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_release(release_id));
CREATE POLICY "Update release_artists" ON release_artists FOR UPDATE TO authenticated
  USING (can_edit_release(release_id)) WITH CHECK (can_edit_release(release_id));
CREATE POLICY "Delete release_artists" ON release_artists FOR DELETE TO authenticated USING (can_edit_release(release_id));

CREATE POLICY "Insert release_credits" ON release_credits FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_release(release_id));
CREATE POLICY "Update release_credits" ON release_credits FOR UPDATE TO authenticated
  USING (can_edit_release(release_id)) WITH CHECK (can_edit_release(release_id));
CREATE POLICY "Delete release_credits" ON release_credits FOR DELETE TO authenticated USING (can_edit_release(release_id));

CREATE POLICY "Insert release_images" ON release_images FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_release(release_id));
CREATE POLICY "Update release_images" ON release_images FOR UPDATE TO authenticated
  USING (can_edit_release(release_id)) WITH CHECK (can_edit_release(release_id));
CREATE POLICY "Delete release_images" ON release_images FOR DELETE TO authenticated USING (can_edit_release(release_id));

CREATE POLICY "Insert track_credits" ON track_credits FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_track(track_id));
CREATE POLICY "Update track_credits" ON track_credits FOR UPDATE TO authenticated
  USING (can_edit_track(track_id)) WITH CHECK (can_edit_track(track_id));
CREATE POLICY "Delete track_credits" ON track_credits FOR DELETE TO authenticated USING (can_edit_track(track_id));

CREATE POLICY "Insert track_artists" ON track_artists FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_track(track_id));
CREATE POLICY "Update track_artists" ON track_artists FOR UPDATE TO authenticated
  USING (can_edit_track(track_id)) WITH CHECK (can_edit_track(track_id));
CREATE POLICY "Delete track_artists" ON track_artists FOR DELETE TO authenticated USING (can_edit_track(track_id));

-- Group membership needs edit rights on BOTH the group and the member
CREATE POLICY "Insert group_members" ON group_members FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_artist(group_id) AND can_edit_artist(member_id));
CREATE POLICY "Update group_members" ON group_members FOR UPDATE TO authenticated
  USING (can_edit_artist(group_id)) WITH CHECK (can_edit_artist(group_id) AND can_edit_artist(member_id));
CREATE POLICY "Delete group_members" ON group_members FOR DELETE TO authenticated USING (can_edit_artist(group_id));

CREATE POLICY "Insert artist_aliases" ON artist_aliases FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND can_edit_artist(artist_id));
CREATE POLICY "Update artist_aliases" ON artist_aliases FOR UPDATE TO authenticated
  USING (can_edit_artist(artist_id)) WITH CHECK (can_edit_artist(artist_id));
CREATE POLICY "Delete artist_aliases" ON artist_aliases FOR DELETE TO authenticated USING (can_edit_artist(artist_id));

-- Credit roles: users may add custom roles; staff manage the list
CREATE POLICY "Insert credit_roles" ON credit_roles FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid()) AND is_custom = true) OR is_staff());
CREATE POLICY "Staff update credit_roles" ON credit_roles FOR UPDATE TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "Staff delete credit_roles" ON credit_roles FOR DELETE TO authenticated
  USING (is_staff());

-- Profiles: your own, or any profile for an admin (role changes are also guarded by a trigger)
CREATE POLICY "Update own profile or admin" ON profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR is_admin());

-- Edit proposals: visible to the submitter and staff only
CREATE POLICY "View edit_proposals" ON edit_proposals FOR SELECT
  USING (submitted_by = (SELECT auth.uid()) OR is_staff());
CREATE POLICY "Insert pending edit_proposals" ON edit_proposals FOR INSERT TO authenticated
  WITH CHECK (submitted_by = (SELECT auth.uid()) AND status = 'pending');
CREATE POLICY "Staff update edit_proposals" ON edit_proposals FOR UPDATE TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY "Staff delete edit_proposals" ON edit_proposals FOR DELETE TO authenticated
  USING (is_staff());

-- -----------------------------------------------------------------------------------------------------
-- 8. Privileges
-- A hosted Supabase project grants privileges on new tables and functions in public to anon, authenticated
-- and service_role by default; row-level security decides what each role may actually do with the tables.
-- Functions not listed here keep those default grants (search_all, is_admin, is_staff, can_edit_*, and the
-- trigger functions). Revoking from PUBLIC alone is not enough there, so anon is named explicitly.
-- -----------------------------------------------------------------------------------------------------
REVOKE ALL ON import_calls FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Signed-in users only (each function checks permissions itself or runs under row-level security)
REVOKE EXECUTE ON FUNCTION create_release(JSONB)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION find_duplicate_releases(TEXT, TEXT[])    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION replace_release_content(UUID, JSONB)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION replace_artist_content(UUID, JSONB)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apply_edit_proposal(UUID, TEXT)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION reject_edit_proposal(UUID, TEXT)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION merge_artists(UUID, UUID)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION merge_credit_role(UUID, UUID)            FROM PUBLIC, anon;
REVOKE ALL     ON FUNCTION link_release_edition(UUID, UUID)         FROM PUBLIC, anon;
REVOKE ALL     ON FUNCTION unlink_release_edition(UUID)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION consume_import_quota()                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION create_release(JSONB)                    TO authenticated;
GRANT  EXECUTE ON FUNCTION find_duplicate_releases(TEXT, TEXT[])    TO authenticated;
GRANT  EXECUTE ON FUNCTION replace_release_content(UUID, JSONB)     TO authenticated;
GRANT  EXECUTE ON FUNCTION replace_artist_content(UUID, JSONB)      TO authenticated;
GRANT  EXECUTE ON FUNCTION apply_edit_proposal(UUID, TEXT)          TO authenticated;
GRANT  EXECUTE ON FUNCTION reject_edit_proposal(UUID, TEXT)         TO authenticated;
GRANT  EXECUTE ON FUNCTION merge_artists(UUID, UUID)                TO authenticated;
GRANT  EXECUTE ON FUNCTION merge_credit_role(UUID, UUID)            TO authenticated;
GRANT  EXECUTE ON FUNCTION link_release_edition(UUID, UUID)         TO authenticated;
GRANT  EXECUTE ON FUNCTION unlink_release_edition(UUID)             TO authenticated;
GRANT  EXECUTE ON FUNCTION consume_import_quota()                   TO authenticated;

-- Internal helpers: not for anonymous visitors
REVOKE EXECUTE ON FUNCTION resolve_artist(TEXT, TEXT, entity_type)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION resolve_role(TEXT)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION add_credits(JSONB, UUID, UUID)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION add_track_artists(UUID, JSONB, JSONB)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION resolve_artist(TEXT, TEXT, entity_type)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION resolve_role(TEXT)                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION add_credits(JSONB, UUID, UUID)           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION add_track_artists(UUID, JSONB, JSONB)    TO authenticated, service_role;

-- Discogs importer: service role only
REVOKE EXECUTE ON FUNCTION seed_artist(JSONB)                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seed_credits(JSONB, UUID, UUID)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seed_discogs_release(JSONB)              FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION seed_artist(JSONB)                       TO service_role;
GRANT  EXECUTE ON FUNCTION seed_credits(JSONB, UUID, UUID)          TO service_role;
GRANT  EXECUTE ON FUNCTION seed_discogs_release(JSONB)              TO service_role;

-- Bulk edition linking: the SQL editor and the service role (Supabase's default privileges keep the
-- service_role grant; the function also refuses any caller with a signed-in user)
REVOKE ALL ON FUNCTION bulk_link_editions(JSONB) FROM PUBLIC, anon, authenticated;
