-- Fix: cas_upsert_book / cas_upsert_note must clear deleted_at on update.
--
-- Background: soft-deleted rows ("tombstones") carry deleted_at. When a user
-- resolves an update_vs_delete conflict with "Restore", the client enqueues a
-- book/note upsert with baseRevision = current cloud revision (the tombstone's
-- revision). The CAS update succeeds once the revision matches, but the old SQL
-- never cleared deleted_at, so the cloud row stayed a "tombstone with fresh
-- data". Other devices then pulled it as a tombstone and the book never
-- returned.
--
-- An upsert only reaches the UPDATE branch when p_base_revision equals the
-- current cloud revision, so the writer is already synced to the tombstone.
-- Clearing deleted_at here is therefore safe — it cannot clobber concurrent edits.

-- Books
CREATE OR REPLACE FUNCTION cas_upsert_book(
  p_id            uuid,
  p_user_id       uuid,
  p_base_revision int,
  p_title         text DEFAULT '',
  p_author        text DEFAULT '',
  p_tags          jsonb DEFAULT '[]'::jsonb,
  p_is_favourite  boolean DEFAULT false,
  p_file_id       text DEFAULT NULL,
  p_image_id      text DEFAULT NULL
)
RETURNS books
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing books;
  result books;
BEGIN
  SELECT * INTO existing FROM books WHERE id = p_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    IF p_base_revision != 0 THEN
      RAISE EXCEPTION 'CAS conflict: row not found for update (base_revision=%)', p_base_revision;
    END IF;

    INSERT INTO books (id, user_id, title, author, tags, is_favourite, file_id, image_id, revision, updated_at, created_at)
    VALUES (p_id, p_user_id, p_title, p_author, p_tags, p_is_favourite, p_file_id, p_image_id, 1, now(), now())
    RETURNING * INTO result;

    RETURN result;
  END IF;

  IF p_base_revision = 0 THEN
    RAISE EXCEPTION 'CAS conflict: insert collision (row already exists with id=%)', p_id;
  END IF;

  IF existing.revision != p_base_revision THEN
    RAISE EXCEPTION 'CAS conflict: revision mismatch (expected=%, got=%)', p_base_revision, existing.revision;
  END IF;

  UPDATE books SET
    title = p_title,
    author = p_author,
    tags = p_tags,
    is_favourite = p_is_favourite,
    file_id = p_file_id,
    image_id = p_image_id,
    deleted_at = NULL,
    revision = revision + 1,
    updated_at = now()
  WHERE id = p_id AND user_id = p_user_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Notes (parity: a future note-restore path must behave the same way)
CREATE OR REPLACE FUNCTION cas_upsert_note(
  p_book_id       uuid,
  p_user_id       uuid,
  p_base_revision int,
  p_body          text DEFAULT ''
)
RETURNS notes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing notes;
  result notes;
BEGIN
  SELECT * INTO existing FROM notes WHERE book_id = p_book_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    IF p_base_revision != 0 THEN
      RAISE EXCEPTION 'CAS conflict: row not found for update (base_revision=%)', p_base_revision;
    END IF;

    INSERT INTO notes (book_id, user_id, body, revision, updated_at, created_at)
    VALUES (p_book_id, p_user_id, p_body, 1, now(), now())
    RETURNING * INTO result;

    RETURN result;
  END IF;

  IF p_base_revision = 0 THEN
    RAISE EXCEPTION 'CAS conflict: insert collision (note already exists for book_id=%)', p_book_id;
  END IF;

  IF existing.revision != p_base_revision THEN
    RAISE EXCEPTION 'CAS conflict: revision mismatch (expected=%, got=%)', p_base_revision, existing.revision;
  END IF;

  UPDATE notes SET
    body = p_body,
    deleted_at = NULL,
    revision = revision + 1,
    updated_at = now()
  WHERE book_id = p_book_id AND user_id = p_user_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;