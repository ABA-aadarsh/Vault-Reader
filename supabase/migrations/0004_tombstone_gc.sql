-- Phase 8.5: Server tombstone GC + storage cleanup
-- Hard-purge cloud tombstones older than 30 days and remove their storage
-- blobs. Scheduled daily via pg_cron (runs inside Postgres - no external
-- cron needed). Client-side purgeExpiredTombstones stays as a second layer.

-- ============================================================
-- 1. pg_cron
-- ============================================================
-- pg_cron installs into its own `cron` schema (extension is non-relocatable).
create extension if not exists pg_cron;

-- ============================================================
-- 2. GC function
-- ============================================================
-- SECURITY DEFINER (owner = postgres, bypasses RLS). Never expose to
-- anon/authenticated - see REVOKE below. search_path is cleared and every
-- reference is schema-qualified to prevent search-path hijacking.
--
-- The storage service guards storage.objects DELETEs behind the
-- storage.allow_delete_query GUC. We set it transaction-locally (3rd arg
-- true) exactly as the storage API does, scoped to this function's work.
create or replace function public.purge_expired_tombstones()
returns table (
  books_purged   bigint,
  objects_purged bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_books   bigint;
  v_objects bigint;
begin
  -- Storage first: objects live under {userId}/{bookId}/{fileId}.pdf (books)
  -- and {userId}/{bookId}/{imageId}.png (image).
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects
  where bucket_id in ('books', 'image')
    and exists (
      select 1
      from public.books b
      where b.deleted_at is not null
        and b.deleted_at < now() - interval '30 days'
        and (storage.foldername(name))[1] = b.user_id::text
        and (storage.foldername(name))[2] = b.id::text
    );
  get diagnostics v_objects = row_count;

  -- Then rows: notes + reading_states cascade on book delete.
  delete from public.books
  where deleted_at is not null
    and deleted_at < now() - interval '30 days';
  get diagnostics v_books = row_count;

  return query select v_books, v_objects;
end;
$$;

revoke all on function public.purge_expired_tombstones() from public;
revoke all on function public.purge_expired_tombstones() from anon;
revoke all on function public.purge_expired_tombstones() from authenticated;

-- ============================================================
-- 3. Daily schedule (03:00 UTC)
-- ============================================================
select cron.unschedule('vault-tombstone-gc')
where exists (select 1 from cron.job where jobname = 'vault-tombstone-gc');

select cron.schedule(
  'vault-tombstone-gc',
  '0 3 * * *',
  $$ select public.purge_expired_tombstones(); $$
);

-- ============================================================
-- 4. Immediate first sweep: clear any existing backlog
--    (older than 30 days at deploy time)
-- ============================================================
select public.purge_expired_tombstones();