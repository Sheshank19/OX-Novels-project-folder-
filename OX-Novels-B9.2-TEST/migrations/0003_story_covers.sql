CREATE TABLE IF NOT EXISTS story_covers (
  story_id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  image_data BLOB NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Repair records created by the older frontend defaults. New stories now receive
-- a unique generated SVG cover and the next natural display order instead.
UPDATE stories
SET cover = ''
WHERE id <> 'wolves-blood-moon'
  AND cover = '/covers/wolves-blood-moon.svg';

UPDATE stories
SET sort_order = (
  SELECT COUNT(*)
  FROM stories AS older
  WHERE older.created_at <= stories.created_at
)
WHERE sort_order = 100
  AND (SELECT COUNT(*) FROM stories) < 100;
