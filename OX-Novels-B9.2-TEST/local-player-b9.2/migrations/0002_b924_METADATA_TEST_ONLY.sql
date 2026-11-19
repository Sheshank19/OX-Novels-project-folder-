-- OX B9.2.4 LOCAL SQLITE/D1-style test migration.
-- DO NOT APPLY to the main OX database, a remote D1 database, or production.
CREATE TABLE IF NOT EXISTS b924_scans (
 scan_id TEXT PRIMARY KEY, story_id TEXT NOT NULL, root_folder_id TEXT NOT NULL,
 source_version TEXT NOT NULL, snapshot_revision TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('SCANNING','UNCHANGED','NEEDS_FULL_STAGE','FAILED')),
 page_count INTEGER NOT NULL DEFAULT 0, track_count INTEGER NOT NULL DEFAULT 0,
 folder_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS b924_folders (
 scan_id TEXT NOT NULL, folder_id TEXT NOT NULL, parent_id TEXT, depth INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','DONE')),
 total_pages INTEGER NOT NULL DEFAULT 0, received_pages INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(scan_id,folder_id), FOREIGN KEY(scan_id) REFERENCES b924_scans(scan_id)
);
CREATE TABLE IF NOT EXISTS b924_pages (
 scan_id TEXT NOT NULL, folder_id TEXT NOT NULL, page_no INTEGER NOT NULL,
 hash TEXT NOT NULL, track_count INTEGER NOT NULL, child_count INTEGER NOT NULL,
 PRIMARY KEY(scan_id,folder_id,page_no),
 FOREIGN KEY(scan_id,folder_id) REFERENCES b924_folders(scan_id,folder_id)
);
CREATE INDEX IF NOT EXISTS b924_pending ON b924_folders(scan_id,status,depth);
CREATE INDEX IF NOT EXISTS b924_page_order ON b924_pages(scan_id,folder_id,page_no);
