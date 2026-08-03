# Vault Reader — Sync Architecture Plan

## 1. Goal

Build a **cloud-coordinated multi-master**, offline-first sync system for a **single-user, multi-device** PDF reader so that:

- User logs in once, then works offline with a cached session.
- Books can be **local-only** or **cloud** (promote local→cloud allowed; demote forbidden).
- Cloud books’ **metadata, notes, covers** converge across devices; **PDFs** download lazily.
- Deletes, updates, and concurrent edits are correct via **revisions + CAS**, **tombstones**, and a **conflict inbox**.
- Sync is one orchestrated engine — not ad-hoc hooks.

## 2. Non-goals (v1)

- Multi-user / shared libraries
- CRDT notes (planned later)
- Supabase Realtime (poll only)
- Per-book progress toggle
- Guest mode without account
- Demote cloud→local
- Non-PDF formats
- Server note search
- E2E encryption
- Production data migration (**clean break / wipe OK**)

## 3. Locked decisions

| Topic | Decision |
|--------|----------|
| Topology | Cloud-coordinated multi-master (Supabase = merge hub) |
| Entities | Book meta, file ref, notes, reading progress (optional sync) |
| Versioning | Integer `revision` + CAS on push; CRDT for notes later |
| Deletes | Soft delete + 30-day tombstones + undo |
| Conflicts | Policy matrix (auto vs user); conflict inbox |
| PDFs | Lazy download, immutable after create |
| Covers | Eager download |
| Scope | `local` \| `cloud`; promote yes; demote no |
| Notes | One note document per book |
| Engine | Single `SyncEngine.runCycle`: push → pull → file planner |
| Local DB | Per-user Dexie: `bookVaultDB:${userId}` |
| Progress | Per-device default; global "sync progress" off by default; max page/percent when on |
| Conflict UX | Status chip + conflict inbox (sheet/modal, not full page) |
| Auth | First login required; cached session; offline local use; banner if expired |
| Expired session | Full local use; block sync/download/promote |
| Transport | Poll + lifecycle triggers |
| Errors | Classified + exponential backoff |
| Storage | Reuse existing `books` + `image` buckets; path prefix `{userId}/{bookId}/{fileId}.pdf` + RLS |
| Migration | Clean break; Supabase CLI at repo root |
| CAS | Single upsert SQL RPC per entity (books, notes, reading_states); error on collision when `baseRevision = 0` |
| Tags merge | Auto set-union when both devices change tags |
| Image format | Always `.png` for covers |
| Device ID | Omit `updated_by_device_id` from cloud schema for v1 |
| Verified field | Drop from schema (hardcoded to true, serves no purpose) |
| Tombstone GC | Defer to Phase 8 |
| Recently deleted | Silent tombstones only; no UI in v1 |
| Orphan GC | Delete storage files with DB row in same operation |
| PDF auto-download | Default: `never` (manual open to download) |
| Outbox coalesce | Shallow merge for upsert+upsert; delete wins over upsert; throws on delete+upsert |
| Push file | `src/features/sync/push.ts` — pure functions, separate from syncManager |
| Push CAS | Use `cas_upsert_book` / `cas_upsert_note` RPCs; delete uses direct update with CAS revision check |
| Error classification | auth: 401/403; conflict: CAS conflict; permanent: 400/404/422; transient: network/500+ |
| Backoff | Exponential 1s→60s cap; 20 max attempts then permanent; auth pauses engine |
| Push order | Sort by type (book→note→readingState→fileUpload), then upsert before delete |
| Promote push | Strict insert (baseRevision: 0); row exists = permanent error |
| Note push | Implemented in Phase 4 (not deferred) |
| ReadingState push | Deferred to Phase 10 |
| Storage cleanup on delete | Deferred to Phase 8 |

---

## 4. Current gaps (codebase)

`syncManager.ts` / `book.service.ts` / `dexie.ts` today:

- Op queue push only; no real multi-device merge
- Pull uses wall-clock vs `lastSyncedAt`; skips any pending `docId`
- No tombstones → remote deletes don’t propagate
- No CAS / revision checks (`version: 1` unused)
- Notes are a string on metadata
- Eager PDF pull for all cloud books
- Global Dexie DB (cross-account leak)
- No conflict store/UI
- Delete hard-wipes local then queues cloud delete
- No retry classification / backoff
- Flat storage paths
- Sync triggered from `BookAddProvider` (wrong layer)

---

## 5. Target architecture

### 5.1 Mental model

```
Device A Dexie  ←→  SyncEngine  ←→  Supabase (Postgres + Storage)
Device B Dexie  ←→  SyncEngine  ←→  same hub
```

Each device is a full offline replica of **small data** (meta, notes, progress if enabled, tombstones, cover blobs). PDF bytes are optional cache.

### 5.2 Module layout (target)

```
src/features/sync/
  SyncEngine.ts          # runCycle, triggers, mutex
  outbox.ts              # enqueue, coalesce, retry
  pull.ts                # cursor-based pull + apply
  push.ts                # CAS push per entity
  conflicts.ts           # detect, store, resolve APIs
  filePlanner.ts         # cover eager / PDF lazy downloads
  policy.ts              # merge + conflict rules
  types.ts
src/lib/dexie/
  db.ts                  # per-user factory
  schema.ts
  tables: books, notes, readingState, files, images,
          outbox, conflicts, syncState
src/features/supabase/
  books/                 # thin cloud repos
  notes/
  storage/
  migrations SQL (repo /supabase)
```

### 5.3 Identity

- `userId` from Supabase auth (cached for offline).
- `deviceId` UUID in `localStorage` (stable per browser profile) — **v2; omitted from cloud schema for v1.**
- Every mutation stamps `updatedAt`, bumps local `revision` intent via `baseRevision` tracking.

---

## 6. Data model

### 6.1 Local (Dexie) — DB name `bookVaultDB:${userId}`

**books**

| Field | Notes |
|--------|--------|
| `id` (PK, UUID) | = cloud book id when cloud |
| `title`, `author`, `tags[]`, `isFavourite` | |
| `fileId`, `imageId` | blob keys |
| `syncScope` | `'local' \| 'cloud'` |
| `revision` | local known revision |
| `baseRevision` | last successful sync revision |
| `deletedAt` | number \| null |
| `fileSyncStatus` | `not_downloaded \| downloading \| present \| failed` |
| `coverSyncStatus` | same |
| `syncStatus` | `synced \| pending \| conflict \| failed` |
| `updatedAt`, `updatedByDeviceId` | |
| `origin` | optional |

**notes**

| Field | Notes |
|--------|--------|
| `bookId` (PK) | 1:1 with book |
| `body` | MDX string |
| `revision`, `baseRevision` | |
| `deletedAt` | usually follows book delete |
| `syncStatus`, `updatedAt`, `updatedByDeviceId` | |

**readingState** (always local; cloud only if setting on)

| Field | Notes |
|--------|--------|
| `bookId` (PK) | |
| `page`, `percent` | |
| `revision`, `baseRevision` | if syncing |
| `updatedAt`, `deviceId` | |
| `syncStatus` | |

**files** / **images** — blob stores keyed by `fileId` / `imageId`.

**outbox**

| Field | Notes |
|--------|--------|
| `id`, `entityType`, `entityId` | `book \| note \| readingState \| fileUpload` |
| `op` | `upsert \| delete \| promote` |
| `payload`, `baseRevision` | |
| `createdAt`, `attempts`, `nextAttemptAt` | |
| `lastError`, `errorClass` | `transient \| auth \| conflict \| permanent` |

**conflicts**

| Field | Notes |
|--------|--------|
| `id`, `entityType`, `entityId`, `bookId` | |
| `localSnapshot`, `remoteSnapshot` | |
| `reason` | `cas_mismatch \| update_vs_delete \| field_clash \| note_body` |
| `createdAt`, `status` | `open \| resolved` |

**syncState** (singleton row)

- `lastPullCursor` (`updated_at` + `id`)
- `lastCycleAt`, `lastError`
- `progressSyncEnabled` (or keep in app settings table)

### 6.2 Cloud (Supabase Postgres)

**books**

```
id uuid PK
user_id uuid NOT NULL REFERENCES auth.users
title, author, tags jsonb, is_favourite
file_id, image_id
revision int NOT NULL DEFAULT 1
deleted_at timestamptz NULL
updated_at timestamptz
updated_at timestamptz
created_at timestamptz
```

**notes**

```
book_id uuid PK REFERENCES books(id)
user_id uuid NOT NULL
body text
revision int
deleted_at timestamptz NULL
updated_at, created_at
```

**reading_states** (only used when client enables progress sync)

```
book_id + user_id PK
page int, percent real
revision int
updated_at
```

Indexes: `(user_id, updated_at, id)` for pull; partial index where `deleted_at IS NOT NULL` for GC.

**RLS:** `auth.uid() = user_id` on all tables.

**CAS update pattern:**

```sql
UPDATE books SET ..., revision = revision + 1, updated_at = now()
WHERE id = $id AND user_id = auth.uid() AND revision = $base
RETURNING *;
-- 0 rows => conflict
```

Prefer a single upsert RPC `cas_upsert_book(...)` for atomicity (see CAS pattern above).

### 6.3 Storage

- Reuse existing `books` + `image` buckets
- Path prefix: `{userId}/{bookId}/{fileId}.pdf` / `{userId}/{bookId}/{imageId}.png`
- RLS: per-operation policies; path first folder = `auth.uid()`
- Upload order: blob(s) -> DB row; orphans deleted with DB row in same operation

---

## 7. Sync protocol

### 7.1 `SyncEngine.runCycle()` (mutex: one cycle at a time)

1. **Auth gate** — valid session (or refresh). Else pause push/pull/download; local app continues.
2. **Coalesce outbox** per `(entityType, entityId)`:
   - `upsert+upsert` → merged payload, earliest `baseRevision`
   - `upsert+delete` → `delete`
   - `delete+upsert` → illegal locally (block undelete except restore flow)
   - `promote` special-case
3. **Push** each outbox op in stable order (files before book upsert; book before note).
4. CAS failure → open conflict; **keep** outbox/conflict until user resolves (don’t infinite retry).
5. **Pull** changes since cursor for books/notes/(reading_states if enabled), **including tombstones** (`deleted_at` set).
6. **Apply pull** per entity:
   - If open conflict or pending outbox on entity → skip apply (or 3-way into conflict)
   - Else if `cloud.revision > local.baseRevision` → apply snapshot, set `revision = baseRevision = cloud.revision`
   - Tombstone → apply soft delete locally (remove PDF optional; drop blobs after apply)
7. **File planner:** enqueue missing covers (eager); PDFs per settings / open-book.
8. Update `syncState`, emit UI status.

### 7.2 Triggers

- Post-login (open user DB → cycle)
- `window` `online`
- App focus / visibility
- After local mutation (debounced 500ms)
- Interval (e.g. 60s while visible)
- Manual “Sync now”
- Session refresh success

### 7.3 Mutation API (all local-first)

Every user action:

1. Write Dexie in a transaction
2. Set `syncStatus: pending` if `syncScope === 'cloud'` (or promote)
3. Enqueue outbox
4. Kick `runCycle()` if online + session ok

**Local-only book:** no outbox for cloud; delete is hard local.

**Promote:** set `syncScope: cloud`, enqueue file uploads + book/note upserts with `baseRevision: 0` (insert).

### 7.4 Delete / restore

- Cloud book delete: set local `deletedAt`, bump pending delete op, hide from library UI (or “Recently deleted”).
- Push: CAS soft-delete on cloud (`deleted_at`, `revision++`).
- Pull tombstone → other devices soft-delete.
- Undo < 30d: clear `deletedAt`, push restore CAS.
- After 30d: hard purge row + storage (server cron or edge function).
- **Remove download:** clear local file blob, `fileSyncStatus: not_downloaded`; no cloud change.
- **Update vs delete conflict:** inbox — Restore vs Confirm delete.

### 7.5 File immutability

- PDF bytes never patched in place.
- “Replace PDF” (if ever): new `fileId`, meta upsert with new ref, old blob GC after success.
- v1 can omit replace-PDF UI.

### 7.6 Progress

- Always write local `readingState` (throttled).
- If `progressSyncEnabled`: outbox upserts; pull merge = **max(page), max(percent)**; no user conflict UI.
- If off: never push/pull progress.

### 7.7 Error classes

| Class | Action |
|--------|--------|
| transient | backoff 1s → 5m, max ~20 attempts → `failed` + Retry |
| auth | pause engine, banner |
| conflict | conflicts table |
| permanent | mark failed, user Retry/Discard |

Never silent-drop outbox entries.

---

## 8. Conflict policy (detail)

| Case | Resolution |
|------|------------|
| Meta different fields | Auto merge non-overlapping fields; result revision = max+1 push after resolve commit |
| Meta same field both changed | User: mine / theirs / field picker |
| Favourite both | LWW by higher revision side (auto) |
| Note body both | User: mine / theirs / side-by-side copy |
| Update vs delete | User: restore / confirm delete |
| Progress (if sync on) | max(page/percent) auto |
| File replace both (future) | User |
| Create duplicate id | Treat as bug; identical hash = noop |

While conflict open: pause sync **only for that entity**; rest continues.

---

## 9. Auth & session

- Dashboard requires prior login at least once.
- Persist session via Supabase client; cache `userId` + profile for offline shell.
- Offline + expired access token, refresh fails: **banner** “Sign in to sync”; local CRUD allowed; queue cloud ops.
- Online + refresh works: silent; run cycle.
- Sign-out: close Dexie, clear session; **do not** wipe user DB.
- Sign-in as other user: open other DB only.

---

## 10. UI surfaces

1. **Sync status chip** (header/sidebar): Offline | Syncing | Pending(N) | Conflicts(N) | Synced | Error
2. **Banner:** re-auth required
3. **Conflict inbox** route or sheet
4. **Book menu:** Promote to cloud | Remove download | Delete from library | (local only delete)
5. **Add book:** syncToCloud checkbox (default on if online)
6. **Settings:** Sync reading progress (default off); auto-download PDFs (never / wifi / always) — wifi detection best-effort on web
7. **Recently deleted** (30d) optional but recommended
8. Opening book without file: download progress state

---

## 11. Implementation phases (granular)

### Phase 0 - Spec freeze & clean break *(completed)*

0.1 Document this plan as `plan.md` *(done)*
0.2 ~~Inventory env buckets/tables; schedule wipe of old `metadata` + flat storage~~ *(done — wipe everything: table + storage)*
0.3 Add `/supabase/migrations/0001_sync_v1.sql` (books, notes, reading_states, RLS, indexes, CAS RPCs) — **Supabase CLI at repo root**
0.4 Storage buckets + RLS policies for prefixed paths — **reuse existing `books` + `image` buckets**
0.5 ~~All blocking questions resolved~~ *(resolved in grilling session)*

**Decisions locked for Phase 0:**
- Wipe: everything (metadata table + both storage buckets)
- Migration: Supabase CLI, `supabase/migrations/0001_sync_v1.sql`
- CAS: single upsert RPC per entity; error on insert collision (`baseRevision = 0` + row exists)
- Storage: reuse `books`/`image` buckets; per-operation RLS policies; path prefix = `auth.uid()`
- Include `reading_states` table (empty, ready for Phase 10)
- Omit `updated_by_device_id` for v1; drop `verified` field
- Always `.png` for cover images
- Tags: auto set-union; conflicts: sheet/modal; recently deleted: silent tombstones only
- Tombstone GC: defer to Phase 8; orphan GC: delete with DB row
- PDF auto-download default: `never`

**Exit:** Done. Cloud schema applied; old metadata dropped; storage cleanup pending via dashboard.

---

### Phase 1 — Local foundation *(completed)*

1.1 Dexie factory `openUserDb(userId)` / `closeUserDb()` *(done)*
1.2 Schema v1 tables (books, notes, readingState, files, images, outbox, conflicts, syncState) *(done)*
1.3 On login: open DB; on logout: close *(done)*
1.4 Remove global `bookVaultDB` singleton usage *(done)*
1.5 Domain types + mappers *(done)*
1.6 Unit tests — deferred to Phase 11

**Decisions locked for Phase 1 (from grilling session):**
- Dexie factory: React Context provider (`UserDbProvider` + `useDb()` hook)
- Schema migration: Clean break — delete old DB, create fresh with new schema
- Provider integration: `UserDbProvider` nested inside `RequireAuth` via `DashboardContent` wrapper
- Logout behavior: Close DB on provider unmount (React lifecycle); no changes to `AuthAPI.signout()`
- Domain types: Separate from Dexie types, with mappers (`src/lib/domain.ts`, `src/lib/mappers.ts`)
- File structure: `src/lib/dexie/` directory (`db.ts`, `schema.ts`, `types.ts`, `index.ts`)
- Transition: Big bang — all consumers refactored in Phase 1 (book.service.ts, syncManager.ts, hooks)
- Domain fields: Expose all sync fields on domain types
- Unit tests: Defer to Phase 11
- RequireAuth: Extended with `AuthContext` + `useAuth()` hook to expose userId

**Files created/modified:**
- `src/lib/dexie/schema.ts` — Dexie class with per-user DB name
- `src/lib/dexie/types.ts` — Dexie entry interfaces
- `src/lib/dexie/db.ts` — Factory, context provider, hooks
- `src/lib/dexie/index.ts` — Re-exports
- `src/lib/domain.ts` — Domain types (Book, Note, ReadingState)
- `src/lib/mappers.ts` — Dexie ↔ domain conversion
- `src/features/supabase/auth/components/RequireAuth.tsx` — Added AuthContext
- `src/app/dashboard/layout.tsx` — Added UserDbProvider wrapper
- `src/features/supabase/books/book.service.ts` - Rewritten for new schema
- `src/features/supabase/sync/syncManager.ts` - Rewritten for new schema
- `src/features/Books/hooks/useLocalBookList.ts` — Updated types
- `src/features/Books/hooks/useCloudBookList.ts` — Updated types
- `src/lib/dexie.ts` — Deleted (old global singleton)

**Exit:** two accounts on one browser cannot see each other's data.

---
### Phase 2 — Local repository API (no cloud) *(completed)*

2.1 `books.ts`: create (local|cloud flag), list (exclude deleted), get, getBookByFileId, update meta, soft delete, restore, hard purge local *(done)*
2.2 `notes.ts`: get/upsert by bookId *(done)*
2.3 `readingState.ts`: throttled set page *(done)*
2.4 `files.ts` / `images.ts`: blob store CRUD *(done)*
2.5 Wire Add Book / library / delete UI to repos via mutation hooks *(done)*
2.6 `syncScope` + promote stub (local flag only, enqueues outbox with baseRevision=0) *(done)*

**Files created:**
- `src/lib/books.ts` — book CRUD repo functions
- `src/lib/notes.ts` — notes CRUD repo functions
- `src/lib/readingState.ts` — reading state repo functions
- `src/lib/files.ts` — PDF blob store functions
- `src/lib/images.ts` — cover image blob store functions
- `src/features/Books/hooks/useBooks.ts` — `useBooks()` + `useCloudBooks()` query hooks
- `src/features/Books/hooks/useCreateBook.ts` — create mutation hook
- `src/features/Books/hooks/useUpdateBook.ts` — update mutation hook
- `src/features/Books/hooks/useDeleteBook.ts` — delete mutation hook

**Files modified:**
- `src/lib/dexie/index.ts` — added re-exports for repo modules
- `src/features/Books/_components/BookCard.tsx` — uses `useDeleteBook` hook
- `src/app/dashboard/page.tsx` — uses `useBooks()` + `getImageBlob()`
- `src/app/dashboard/book/[bookId]/page.tsx` — uses `useBooks()` + `getFileBlob()`
- `src/features/Books/provider/BookDropAddProvider.tsx` — uses `useCreateBook()`, removed sync triggers

**Files deleted:**
- `src/features/Books/hooks/useLocalBookList.ts`
- `src/features/Books/hooks/useCloudBookList.ts`
- `src/features/supabase/books/book.service.ts` (+ directory)

**Decisions locked for Phase 2 (from grilling session):**
- Standalone function modules (not classes/repos) in `src/lib/`
- Domain types returned from repos; Dexie types internal only
- Single Dexie `db.transaction()` for multi-table writes (book creation)
- Mutation hooks own React Query invalidation; repo functions are pure data logic
- `book.service.ts` replaced in-place (deleted, consumers migrated)
- Old hooks deleted; new `useBooks`/`useCloudBooks` hooks created
- Promote writes outbox entry with `baseRevision: 0` (ready for Phase 4)
- Sync triggers removed from `BookDropAddProvider` (Phase 6 territory)

**Exit:** App works fully offline against new schema; old BooksAPI paths deprecated.

---

### Phase 3 — Outbox *(completed)*

3.1 Centralized `enqueue()` in `src/lib/outbox.ts` — transactional coalesce *(done)*
3.2 Coalesce rules: shallow merge upsert+upsert, delete wins over upsert, throws on delete+upsert *(done)*
3.3 `inspectOutbox()` console dump helper *(done)*
3.4 `getPendingCount()` + `getOutboxStats()` status APIs *(done)*
3.5 Books/notes repos migrated to use `enqueue()` *(done)*
3.6 `SyncManager.queueOperation` replaced with `triggerSyncIfOnline()` *(done)*

**Decisions locked for Phase 3 (from grilling session):**
- Enqueue: centralized `src/lib/outbox.ts` module; books.ts and notes.ts call `enqueue()` instead of inline `db.outbox.add()`
- Coalesce: shallow merge for upsert+upsert (new keys overwrite, old keys preserved); earliest `baseRevision` kept
- Delete vs upsert: `delete` wins over `upsert`; reverse order (delete+upsert) throws error — must use `restoreBook()` flow
- Promote: always inserts fresh, no coalesce with existing outbox entries
- Atomicity: coalesce check + write runs in a single Dexie transaction
- ReadingState outbox: deferred to Phase 10
- Error classification + backoff: deferred to Phase 4
- Inspector: console dump function (`inspectOutbox()`), called from browser DevTools
- Status counts: both `getPendingCount()` (for sync chip) and `getOutboxStats()` (detailed breakdown)

**Files created:**
- `src/lib/outbox.ts` — enqueue, inspectOutbox, getPendingCount, getOutboxStats

**Files modified:**
- `src/lib/books.ts` — 5 inline `db.outbox.add()` replaced with `enqueue()`
- `src/lib/notes.ts` — 3 inline `db.outbox.add()` replaced with `enqueue()`
- `src/features/supabase/sync/syncManager.ts` — `queueOperation` replaced with `triggerSyncIfOnline()`
- `src/lib/dexie/index.ts` — added outbox exports

**Exit:** every cloud-intent mutation leaves a coalesced outbox row.

---

### Phase 4 — Push path (cloud write) *(completed)*

4.1 Storage upload helper with idempotent check (skip if file already exists in bucket) *(done)*
4.2 CAS RPC clients: `cas_upsert_book`, `cas_upsert_note` via `supabase.rpc()` *(done)*
4.3 `push.ts`: book upsert → note upsert → delete (sorted by type) *(done)*
4.4 Insert path: `baseRevision = 0` for promote; CAS RPC handles insert vs update *(done)*
4.5 Error classification: auth/conflict/permanent/transient with exponential backoff *(done)*
4.6 Mark entity `synced` + update `revision`/`baseRevision` from RPC response *(done)*
4.7 Auth error pauses engine (breaks push loop, logs warning) *(done)*

**Decisions locked for Phase 4 (from grilling session):**
- Push file: new `src/features/sync/push.ts` with pure functions; `syncManager.ts` calls `pushOutbox()`
- CAS usage: `cas_upsert_book` and `cas_upsert_note` RPCs for upserts; direct update with `.eq("revision", ...)` for soft-deletes (RPC doesn't support `deleted_at`)
- Note push: implemented now (not deferred) — RPC already existed in migration
- ReadingState push: deferred to Phase 10 (no outbox entries yet)
- Error classification: auth (401/403) pauses engine; conflict (CAS) defers to Phase 7; permanent (400/404/422) stops retry; transient (network/500+) schedules backoff
- Backoff: exponential 1s → 60s cap; max 20 attempts → permanent; `nextAttemptAt` used for scheduling
- Push order: sort entries by entity type (book → note) then by op (upsert before delete)
- Promote: strict insert (`baseRevision: 0`); if row exists → CAS conflict → permanent error
- File upload: inline in book/promote handlers (not separate `fileUpload` outbox entries); idempotent (checks if file exists in bucket before uploading)
- Storage cleanup on delete: deferred to Phase 8

**Files created:**
- `src/features/sync/push.ts` — pushOutbox, handlers, error classification, backoff

**Files modified:**
- `src/features/supabase/sync/syncManager.ts` — removed `_syncBookUpsert`, `_syncBookDelete`, `_syncBookPromote`; `processQueue` now calls `pushOutbox()`

**Exit:** single device online create/update/delete reaches Supabase correctly; retry on blip works.

---

### Phase 5 — Pull path (cloud read)

5.1 Cursor pull queries (include deleted rows)
5.2 Apply book/note/reading_state snapshots
5.3 Tombstone apply → local soft delete + blob cleanup
5.4 Skip apply when pending/conflict
5.5 Eager cover download in file planner
5.6 Lazy PDF: status fields; download on open; remove download
5.7 Second device smoke: login → see meta/covers → open downloads PDF

**Exit:** multi-device converge for happy path (no conflicts).

---

### Phase 6 — SyncEngine orchestration

6.1 `runCycle` mutex + steps 7.1
6.2 All triggers wired; remove sync from `BookAddProvider`
6.3 Sync status store (React context or query)
6.4 Manual Sync now
6.5 Interval + visibility
6.6 Cycle metrics/logging

**Exit:** one obvious sync entry point; UI reflects state.

---

### Phase 7 — Conflicts

7.1 On CAS fail: write `conflicts` + snapshots
7.2 Auto field-merge implementation for meta
7.3 Progress max-merge (when enabled)
7.4 Conflict inbox UI list
7.5 Resolvers: keep mine / keep theirs / merge fields / note side-by-side / update-vs-delete
7.6 On resolve: write local winner, enqueue push with correct `baseRevision` (= remote.revision), clear conflict
7.7 Status chip conflict count + toast

**Exit:** deliberate conflict scenarios resolvable without stuck sync.

---

### Phase 8 — Promote, scope, delete UX

8.1 Promote local→cloud flow + confirm
8.2 Block demote (no UI)
8.3 Delete copy: “Delete from library (all devices)” vs “Remove download”
8.4 Recently deleted + restore (30d client; server GC job)
8.5 Server tombstone GC (SQL cron / edge) + storage orphan sweep

**Exit:** lifecycle matches product language.

---

### Phase 9 — Auth offline UX

9.1 Session expiry detection
9.2 Banner component
9.3 Allow local mutations + queue while blocked from network ops
9.4 Re-auth → automatic cycle drain
9.5 RequireAuth allows offline shell when cached user present

**Exit:** airplane mode usable after first login.

---

### Phase 10 — Progress setting & polish

10.1 Settings toggle progress sync (default off)
10.2 Auto-download policy setting
10.3 Failed op Retry/Discard UI on book
10.4 Empty/error states for download failures
10.5 Performance: pull pagination, outbox batch limits
10.6 Max PDF size / storage quota messaging (deferred from follow-ups; still open)

**Exit:** settings complete; no stuck failed ops without UI.

---

### Phase 11 — Hardening & tests

11.1 Add test runner (Vitest)
11.2 Tests: coalesce, CAS conflict detect, tombstone apply, field merge, progress max, per-user DB isolation
11.3 Manual multi-device checklist (script in plan or `docs/sync-qa.md`)
11.4 Remove dead Appwrite / old sync code
11.5 Turn on TypeScript build errors (stop `ignoreBuildErrors` for sync modules at least)

**Exit:** confidence for daily use.

---

### Phase 12 — (Later) Follow-on roadmap

- CRDT note bodies
- Realtime wake-up
- Replace PDF flow
- Per-book progress
- E2E encryption
- Guest → account migrate

---

## 12. Write—write scenarios (worked examples)

1. **A edits title, B edits tags (same base rev)**  
   Both push: first wins rev N+1; second CAS fails → auto field-merge → push merged at N+1 base.

2. **A and B both edit title**  
   CAS fail → inbox field clash → user picks.

3. **A deletes, B edits note offline**  
   A tombstone on cloud. B push note may succeed then book delete pull, or book CAS delete vs B’s book pending → **update_vs_delete** inbox.

4. **A offline delete, B offline favourite**  
   Same as update vs delete on book entity.

5. **Local-only book on A**  
   Never pulled to B; no outbox.

6. **Promote on A**  
   B pull sees new book + cover; PDF on open.

7. **Remove download on B**  
   Meta remains; file gone; re-open fetches again.

8. **Note both edit**  
   CAS fail → side-by-side → winner push.

9. **Progress sync off**  
   Divergent pages per device; no conflict.

10. **Progress sync on**  
    max(page) wins automatically.

---

## 13. Manual QA checklist (multi-device)

- [ ] Create cloud book on A → appears on B (meta+cover)
- [ ] Open on B downloads PDF once
- [ ] Edit title A / tags B → merge or inbox
- [ ] Edit note both → inbox
- [ ] Delete on A → gone on B after cycle
- [ ] Offline delete A + offline edit B → conflict UX
- [ ] Local book stays on A only
- [ ] Promote local → appears on B
- [ ] User switch on same browser → isolation
- [ ] Expire session offline → banner, local edit queues, re-auth drains
- [ ] Progress toggle off/on behavior
- [ ] Remove download ≠ delete library

---

## 14. Success criteria

- Two devices, flaky network: library meta/notes converge without silent loss.
- Deletes propagate within one successful cycle after online.
- Conflicts never stuck without user-visible inbox item.
- Local-only books never leave device.
- Account B never reads Account A local DB.
- Opening a cloud book without local PDF always has a clear download path.

---

## 15. Reference: existing code to replace

| Area | Current | Target |
|------|---------|--------|
| Local DB | `src/lib/dexie.ts` singleton | Per-user factory + new schema |
| Sync | `src/features/supabase/sync/syncManager.ts` | `src/features/sync/*` engine |
| Books API | `src/features/supabase/books/book.service.ts` | Local repos + thin cloud clients |
| Triggers | `BookDropAddProvider` online/sync | `SyncEngine` only |
| Notes | `metadata.note` string | `notes` table 1:1 book |

---

*Plan approved from grilling session. Start implementation at Phase 0.2 / Phase 1.*
