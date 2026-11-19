-- Apply ONLY to a dedicated catalog-pointer D1 database, NEVER the OX main D1.
CREATE TABLE IF NOT EXISTS b92_live_pointers (
  story_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1),
  state_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS b92_live_staged (
  story_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  staged_at_ms INTEGER NOT NULL,
  track_count INTEGER NOT NULL,
  folder_count INTEGER NOT NULL,
  source_version TEXT NOT NULL,
  PRIMARY KEY(story_id,generation_id)
);
