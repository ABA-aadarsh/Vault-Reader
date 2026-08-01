-- Vault Reader sync schema v1
-- Clean break: replaces old metadata table + flat storage

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Books
CREATE TABLE books (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '',
  author      text NOT NULL DEFAULT '',
  tags        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_favourite boolean NOT NULL DEFAULT false,
  file_id     text,
  image_id    text,
  revision    int NOT NULL DEFAULT 1,
  deleted_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Notes (1:1 with book)
CREATE TABLE notes (
  book_id     uuid PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  revision    int NOT NULL DEFAULT 1,
  deleted_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Reading states (only synced when client enables progress sync)
CREATE TABLE reading_states (
  book_id     uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page        int NOT NULL DEFAULT 0,
  percent     real NOT NULL DEFAULT 0,
  revision    int NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, user_id)
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Pull cursor: (user_id, updated_at, id) for incremental fetch
CREATE INDEX idx_books_pull ON books (user_id, updated_at, id);
CREATE INDEX idx_notes_pull ON notes (user_id, updated_at, book_id);
CREATE INDEX idx_reading_states_pull ON reading_states (user_id, updated_at, book_id);

-- Tombstone partial index for GC
CREATE INDEX idx_books_tombstones ON books (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_notes_tombstones ON notes (user_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_states ENABLE ROW LEVEL SECURITY;

-- Books: users can only access their own rows
CREATE POLICY books_select ON books
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY books_insert ON books
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY books_update ON books
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY books_delete ON books
  FOR DELETE USING (auth.uid() = user_id);

-- Notes: users can only access their own rows
CREATE POLICY notes_select ON notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notes_insert ON notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY notes_update ON notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY notes_delete ON notes
  FOR DELETE USING (auth.uid() = user_id);

-- Reading states: users can only access their own rows
CREATE POLICY reading_states_select ON reading_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY reading_states_insert ON reading_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY reading_states_update ON reading_states
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY reading_states_delete ON reading_states
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. CAS UPSERT RPCs
-- ============================================================

-- Books upsert: handles both insert (base=0) and update (base>0)
CREATE OR REPLACE FUNCTION cas_upsert_book(
  p_id          uuid,
  p_user_id     uuid,
  p_base_revision int,
  p_title       text DEFAULT '',
  p_author      text DEFAULT '',
  p_tags        jsonb DEFAULT '[]'::jsonb,
  p_is_favourite boolean DEFAULT false,
  p_file_id     text DEFAULT NULL,
  p_image_id    text DEFAULT NULL
)
RETURNS books
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing books;
  result books;
BEGIN
  -- Try to find existing row
  SELECT * INTO existing FROM books WHERE id = p_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    -- No existing row
    IF p_base_revision != 0 THEN
      -- Cannot update a non-existent row
      RAISE EXCEPTION 'CAS conflict: row not found for update (base_revision=%)', p_base_revision;
    END IF;

    -- Insert new row
    INSERT INTO books (id, user_id, title, author, tags, is_favourite, file_id, image_id, revision, updated_at, created_at)
    VALUES (p_id, p_user_id, p_title, p_author, p_tags, p_is_favourite, p_file_id, p_image_id, 1, now(), now())
    RETURNING * INTO result;

    RETURN result;
  END IF;

  -- Row exists
  IF p_base_revision = 0 THEN
    -- Insert collision: row already exists with base=0
    RAISE EXCEPTION 'CAS conflict: insert collision (row already exists with id=%)', p_id;
  END IF;

  -- Update: check revision matches
  IF existing.revision != p_base_revision THEN
    RAISE EXCEPTION 'CAS conflict: revision mismatch (expected=%, got=%)', p_base_revision, existing.revision;
  END IF;

  -- Perform update
  UPDATE books SET
    title = p_title,
    author = p_author,
    tags = p_tags,
    is_favourite = p_is_favourite,
    file_id = p_file_id,
    image_id = p_image_id,
    revision = revision + 1,
    updated_at = now()
  WHERE id = p_id AND user_id = p_user_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Notes upsert: handles both insert (base=0) and update (base>0)
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
    revision = revision + 1,
    updated_at = now()
  WHERE book_id = p_book_id AND user_id = p_user_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Reading states upsert: handles both insert (base=0) and update (base>0)
CREATE OR REPLACE FUNCTION cas_upsert_reading_state(
  p_book_id       uuid,
  p_user_id       uuid,
  p_base_revision int,
  p_page          int DEFAULT 0,
  p_percent       real DEFAULT 0
)
RETURNS reading_states
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing reading_states;
  result reading_states;
BEGIN
  SELECT * INTO existing FROM reading_states WHERE book_id = p_book_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    IF p_base_revision != 0 THEN
      RAISE EXCEPTION 'CAS conflict: row not found for update (base_revision=%)', p_base_revision;
    END IF;

    INSERT INTO reading_states (book_id, user_id, page, percent, revision, updated_at)
    VALUES (p_book_id, p_user_id, p_page, p_percent, 1, now())
    RETURNING * INTO result;

    RETURN result;
  END IF;

  IF p_base_revision = 0 THEN
    RAISE EXCEPTION 'CAS conflict: insert collision (reading_state already exists for book_id=%)', p_book_id;
  END IF;

  IF existing.revision != p_base_revision THEN
    RAISE EXCEPTION 'CAS conflict: revision mismatch (expected=%, got=%)', p_base_revision, existing.revision;
  END IF;

  UPDATE reading_states SET
    page = p_page,
    percent = p_percent,
    revision = revision + 1,
    updated_at = now()
  WHERE book_id = p_book_id AND user_id = p_user_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. STORAGE RLS POLICIES
-- ============================================================

-- Books bucket: user-scoped paths {userId}/{bookId}/{fileId}.pdf
CREATE POLICY "books_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "books_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "books_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "books_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'books'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Image bucket: user-scoped paths {userId}/{bookId}/{imageId}.png
CREATE POLICY "image_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'image'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "image_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'image'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "image_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'image'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "image_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'image'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
