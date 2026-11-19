CREATE TABLE IF NOT EXISTS media_assets (
  asset_key TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  image_data BLOB NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_updated ON media_assets(updated_at);
