-- idempotent; applied via POST /api/plan/migrate
CREATE TABLE IF NOT EXISTS plan (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  brief       text NOT NULL DEFAULT '',
  audience    text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deck_version (
  id          text PRIMARY KEY,
  plan_id     text NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  version_no  int  NOT NULL,
  deck_json   jsonb NOT NULL,
  meta_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_no)
);
CREATE INDEX IF NOT EXISTS deck_version_plan_idx ON deck_version(plan_id, version_no DESC);
