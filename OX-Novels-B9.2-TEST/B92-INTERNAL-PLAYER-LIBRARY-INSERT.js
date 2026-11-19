    // OX B9.2: authenticated, read-only story roster for the separate audio Player.
    if (pathname === "/api/internal/player-library") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const secret = String(env.OX_PLAYER_SYNC_KEY || "");
      const received = String(request.headers.get("authorization") || "");
      const expected = `Bearer ${secret}`;
      let mismatch = received.length ^ expected.length;
      for (let i = 0; i < Math.max(received.length, expected.length); i++) {
        mismatch |= (received.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
      }
      if (secret.length < 32 || mismatch !== 0) return json({ error: "Unauthorized" }, 401);
      try {
        const result = await env.DB.prepare("SELECT id,title,visible,drive_url FROM stories ORDER BY title COLLATE NOCASE").all();
        const stories = (result.results || []).map((row) => ({
          id: String(row.id || ""),
          title: String(row.title || ""),
          visible: Number(row.visible || 0) === 1,
          folderId: extractDriveFolderId(row.drive_url || "")
        }));
        return json({ ok: true, stories, generatedAt: new Date().toISOString() }, 200, {
          "x-content-type-options": "nosniff"
        });
      } catch {
        return json({ error: "Library temporarily unavailable" }, 503);
      }
    }
