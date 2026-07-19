-- company KB system of record (v1.13). Idempotent — applied by /api/admin/migrate-kb.
-- Lives in the SAME Neon database as the Library (kb.nanoteofficial.me).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- array_to_string() is only STABLE, which Postgres rejects inside a generated
-- column. This wrapper is genuinely immutable for text[] input. PG14+ RETURN
-- syntax keeps the body semicolon-free for the migrate route's splitter.
CREATE OR REPLACE FUNCTION kb_entry_tags_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN array_to_string($1, ' ');

CREATE TABLE IF NOT EXISTS kb_entry (
  id          text PRIMARY KEY,            -- existing KbEntry.id (<dept>:<ts>), unchanged
  slug        text NOT NULL,          -- NOT unique: legacy same-day entries can share one — reads pick newest
  dept        text NOT NULL,
  date        date NOT NULL,
  ts          timestamptz NOT NULL,
  category    text NOT NULL,
  theme       text,
  status      text NOT NULL CHECK (status IN ('draft','published','archived')),
  pinned      boolean NOT NULL DEFAULT false,
  incomplete  boolean NOT NULL DEFAULT false,
  provenance  text NOT NULL DEFAULT 'api',
  summary     text NOT NULL DEFAULT '',
  highlight    text NOT NULL DEFAULT '',
  highlight_en text NOT NULL DEFAULT '',
  flags       jsonb NOT NULL DEFAULT '[]',
  flags_en    jsonb NOT NULL DEFAULT '[]',
  tags        text[] NOT NULL DEFAULT '{}',
  artifacts   jsonb NOT NULL DEFAULT '[]',
  sources     jsonb NOT NULL DEFAULT '[]',
  related     text[] NOT NULL DEFAULT '{}',
  markdown    text NOT NULL DEFAULT '',
  markdown_en text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  search      tsvector GENERATED ALWAYS AS (
                to_tsvector('english',
                  coalesce(summary,'') || ' ' || coalesce(highlight_en,'') || ' ' ||
                  coalesce(markdown_en,'') || ' ' || kb_entry_tags_text(tags))
              ) STORED
);
CREATE INDEX IF NOT EXISTS kb_entry_status_date_idx ON kb_entry (status, date DESC);
CREATE INDEX IF NOT EXISTS kb_entry_slug_idx   ON kb_entry (slug);
CREATE INDEX IF NOT EXISTS kb_entry_dept_idx   ON kb_entry (dept);
CREATE INDEX IF NOT EXISTS kb_entry_theme_idx  ON kb_entry (theme);
CREATE INDEX IF NOT EXISTS kb_entry_search_idx ON kb_entry USING gin (search);
CREATE INDEX IF NOT EXISTS kb_entry_trgm_idx   ON kb_entry
  USING gin ((summary || ' ' || highlight || ' ' || markdown) gin_trgm_ops);
