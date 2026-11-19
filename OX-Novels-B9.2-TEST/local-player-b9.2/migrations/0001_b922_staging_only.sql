-- OX B9.2.2 TEST-ONLY D1 schema.
-- DO NOT APPLY TO PRODUCTION or the main OX D1 database.
-- Separate B9 staging database, no credentials or audio content stored here.
CREATE TABLE IF NOT EXISTS b922_jobs (
 job_id TEXT PRIMARY KEY, story_id TEXT NOT NULL, root_folder_id TEXT NOT NULL,
 source_version TEXT NOT NULL, generation_id TEXT NOT NULL, cycle TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('SCANNING','TOKENIZING','READY_LOCAL','FAILED')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 folder_total INTEGER NOT NULL DEFAULT 0, track_total INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS b922_folders (
 job_id TEXT NOT NULL, folder_id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL,
 depth INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','DONE')),
 expected_pages INTEGER NOT NULL DEFAULT 0, received_pages INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(job_id,folder_id),
 FOREIGN KEY(job_id) REFERENCES b922_jobs(job_id)
);
CREATE TABLE IF NOT EXISTS b922_pages (
 job_id TEXT NOT NULL, folder_id TEXT NOT NULL, page_no INTEGER NOT NULL,
 total_pages INTEGER NOT NULL, hash TEXT NOT NULL,
 PRIMARY KEY(job_id,folder_id,page_no),
 FOREIGN KEY(job_id,folder_id) REFERENCES b922_folders(job_id,folder_id)
);
CREATE TABLE IF NOT EXISTS b922_tracks (
 job_id TEXT NOT NULL, file_id TEXT NOT NULL,folder_id TEXT NOT NULL,
 page_no INTEGER NOT NULL,track_pos INTEGER NOT NULL,name TEXT NOT NULL,
 mime_type TEXT NOT NULL,size INTEGER NOT NULL,modified_at TEXT NOT NULL,
 token TEXT,
 PRIMARY KEY(job_id,file_id),
 FOREIGN KEY(job_id,folder_id) REFERENCES b922_folders(job_id,folder_id)
);
CREATE INDEX IF NOT EXISTS b922_tracks_unfinished ON b922_tracks(job_id,token,folder_id,page_no,track_pos);
CREATE INDEX IF NOT EXISTS b922_folder_pending ON b922_folders(job_id,status,depth);
