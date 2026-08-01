-- Phase 0.2: Wipe old data
-- Clean break: remove old metadata table and clear storage

-- Drop the old metadata table if it exists
DROP TABLE IF EXISTS metadata CASCADE;

-- Note: Storage bucket cleanup must be done via Supabase dashboard or API
-- because storage.objects RLS policies prevent direct SQL deletion.
-- Steps:
-- 1. Go to Supabase Dashboard > Storage > books bucket > delete all files
-- 2. Go to Supabase Dashboard > Storage > image bucket > delete all files
