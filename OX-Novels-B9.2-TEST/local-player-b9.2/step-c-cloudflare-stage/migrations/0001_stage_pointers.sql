-- Dedicated Step C staging D1 database ONLY; never apply to production D1.
CREATE TABLE IF NOT EXISTS stage_pointers (
  story_id TEXT PRIMARY KEY NOT NULL CHECK(story_id='b92-staging-fixture'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  pointer_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
