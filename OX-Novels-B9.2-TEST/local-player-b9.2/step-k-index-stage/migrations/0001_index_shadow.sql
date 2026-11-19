-- OX B9.2 Step K: dedicated SYNTHETIC-ONLY staging D1 schema.
-- Apply ONLY to ox-b92-step-k-index-db, NEVER any existing Player D1.
CREATE TABLE IF NOT EXISTS b92_j_pointers (
  story_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  current_generation TEXT NOT NULL,
  current_source_version TEXT NOT NULL,
  previous_generation TEXT,
  previous_source_version TEXT,
  grace_until_ms INTEGER,
  CHECK((previous_generation IS NULL AND previous_source_version IS NULL AND grace_until_ms IS NULL)
     OR (previous_generation IS NOT NULL AND previous_source_version IS NOT NULL AND grace_until_ms IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS b92_j_members (
  story_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  token_digest TEXT NOT NULL CHECK(length(token_digest) = 64),
  PRIMARY KEY(story_id,generation_id,token_digest)
) WITHOUT ROWID;
