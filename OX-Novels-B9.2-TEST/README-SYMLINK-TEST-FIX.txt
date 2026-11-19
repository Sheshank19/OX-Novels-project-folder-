OX B9.2 - STEP H WINDOWS SYMLINK TEST FIX

Issue: Windows users without symbolic-link creation privileges see EPERM in the last test, before security behavior is checked.

This patch REPLACES ONLY:
local-player-b9.2\step-h-handoff\tests\step-h.test.mjs

Fix: The test first tries a real symbolic link. If OS policy denies creation with EPERM/EACCES/ENOTSUP, it instead simulates an lstat result that identifies the candidate as a symlink. It still asserts QUARANTINE_FILE_UNSAFE and restores the original filesystem method. Unexpected errors still fail the test.

No production or quarantine source code is changed. No privilege changes needed.
No Drive, Cloudflare, network, deployment or catalog publication.

INSTALL
1. Back up OX-Novels-B9.2-TEST.
2. Extract ZIP into the root of OX-Novels-B9.2-TEST, retaining directory paths; replace the one test file.
3. Run local-player-b9.2\step-h-handoff\B9.2-STEP-H-LOCAL-TEST.bat again.

Expected: 17 tests, 17 pass, 0 fail. On restricted Windows you will see a diagnostic explaining that the symlink rejection guard was verified through a local lstat mock, not a real symlink. This does not mean a physical symlink was tested.

The PRIVATE local handoff test already passed with NO SEALED CHANGE - NO HANDOFF. Do not rerun it, and do not create a fake sealed change receipt.
