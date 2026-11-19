@echo off
setlocal
cd /d "%~dp0..\..\local-player-b5" || (echo Player folder missing & exit /b 1)
echo OX B9.2 - VERIFY ALREADY STORED CANARY, READ-ONLY
 echo No Drive requests, database changes, deployment, secrets, or publication.
echo Reading one completed D1 story audit in memory; no private data files saved.
npx.cmd wrangler d1 execute ox-b92-catalog-control --remote --json --command "SELECT j.cycle_id,j.story_id,j.root_id,j.source_version,j.status,j.page_count,j.folder_count,j.track_count,j.state_json,p.folder_id,p.page_no,p.body_json,p.page_hash FROM b92_audit_jobs j JOIN b92_audit_pages p ON p.cycle_id=j.cycle_id AND p.story_id=j.story_id WHERE j.story_id='a-dragon-s-revenge' AND j.cycle_id=(SELECT cycle_id FROM b92_audit_jobs WHERE story_id='a-dragon-s-revenge' AND status='OBSERVED_UNPINNED' ORDER BY updated_ms DESC LIMIT 1) ORDER BY p.folder_id,p.page_no" | node "%~dp0scripts\verify-remote-audit.mjs"
if errorlevel 1 (
 echo VALIDATION DID NOT PASS - NO DATA MODIFIED
 exit /b 1
)
echo CANARY EVIDENCE VERIFIED - NO CATALOG ACTIVATED
exit /b 0
