PRAGMA foreign_keys = ON;

DELETE FROM stories
WHERE id IN (
  'wolves-blood-moon','alpha-bride','royal-accident','weakest-beast-tamer',
  'heir-in-hiding','twists-love-revenge','owen-and-liam','when-hearts-refuse'
)
AND COALESCE(drive_url,'') = ''
AND COALESCE(source_url,'') = ''
AND (cover = '' OR cover LIKE '/covers/%');
