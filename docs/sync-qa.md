# Sync QA Checklist — Multi-Device Manual Testing

Manual test checklist for daily-use confidence. Two devices (or two browser profiles) required.
Check off each item as it passes.

## Legend

- `[ ]` not yet run
- `[x]` passed
- `[!]` failed / bug found

---

## Cross-device core

- [ ] **C1 — Create cloud book on A → appears on B** — Create a book on Device A with sync enabled. After a sync cycle on B, the book's metadata and cover appear on B.
- [ ] **C2 — Open on B downloads PDF** — Open a cloud book on Device B that has no local PDF. The viewer should download the file on open.
- [ ] **C3 — Edit title A / tags B → merge or inbox** — Edit the title on A and tags on B (same base rev). Push both; first wins, second triggers auto-merge or conflict inbox.
- [ ] **C4 — Edit note both → inbox** — Edit the note on both devices. After sync, a `note_body` conflict appears in the inbox on both.
- [ ] **C5 — Delete on A → gone on B** — Soft-delete a cloud book on A. After A pushes and B pulls, the book disappears from B's library.
- [ ] **C6 — Offline delete A + offline edit B → conflict UX** — Device A goes offline, deletes a book. Device B goes offline, edits the same book. Both come online and push → `update_vs_delete` conflict inbox.
- [ ] **C7 — Local book stays on A only** — Create a local-only book on A. Never promote. B never sees it.
- [ ] **C8 — Promote local → appears on B** — Promote a local-only book on A. After sync, B sees the book (meta + cover).
- [ ] **C9 — User switch on same browser → isolation** — Sign in as User 1, create books. Sign out, sign in as User 2. User 2 sees only their own books.

## Session & offline

- [ ] **S1 — Expire session offline → banner, local edit queues, re-auth drains** — Kill network, wait for session to expire. Banner appears. Make a local edit (queues in outbox). Reconnect and re-auth → sync drains the outbox.
- [ ] **S2 — Expired session blocks sync/promote** — With expired session: manual "Sync now" button disabled, Promote action disabled, banner persists.
- [ ] **S3 — Re-auth after offline SIGNED_OUT** — Sign out while offline, stay in dashboard. Sign in again online → sync resumes.

## Progress sync

- [ ] **P1 — Toggle off (default) — no progress sync** — With progress sync off: read to page 50 on A, page 30 on B. No outbox entries, no cloud writes for reading states.
- [ ] **P2 — Toggle on → progress syncs** — Enable progress sync on both devices. Read to page 50 on A, page 30 on B. After sync: both devices show page 50 (max merge).
- [ ] **P3 — Progress never regresses** — With progress sync on: set A to page 100, sync, then set B to page 10 and sync. A stays at page 100 (max merge).

## Delete & restore

- [ ] **D1 — Recently deleted appears, restore works** — Soft-delete a cloud book. It appears in Recently Deleted. Restore it → book reappears in library with correct sync status.
- [ ] **D2 — Remove download ≠ delete library** — Use "Remove download" on a cloud book. The PDF blob is removed but the book remains in the library.
- [ ] **D3 — Delete propagation** — Delete on A, verify outbox entry created, push succeeds, pull on B shows tombstone (book gone).

## Conflict scenarios (Phase 7 backlog)

### Detection & auto-merge

- [x] **T3 — Field clash + resolver** — Both edit title, different fields, favourites → only clashing field shows in `FieldClashResolver`; remote snapshot is camelCase; resolve re-enqueues.
- [x] **T5 — Auto-merge non-overlapping meta** — Device A edits title, Device B edits author (same base rev). Push succeeds, no conflict, local converges.
- [x] **T6 — Tags auto-union** — Both devices change tags → tags are unioned, no user conflict.
- [ ] **T7 — Favourite LWW** — Both toggle favourite → winner by higher revision, auto-merged, no conflict.

### Resolvers

- [ ] **T8 — Note body conflict** — Both edit note → `note_body` conflict → `NoteBodyResolver` opens, pick mine/theirs → winner pushes with `baseRevision = remote.revision`.
- [ ] **T9 — Update vs delete (Restore)** — Edit book on A, delete on cloud → `UpdateVsDeleteResolver` → **Restore** → book returns, re-enqueued upsert succeeds.
- [ ] **T10 — Update vs delete (Confirm Delete)** — Same setup → **Confirm Delete** → book soft-deleted, delete pushed, cloud converges.

### Blocking & interaction safety

- [ ] **T11 — Edits blocked while conflicted** — While conflict open: `updateBook`, `softDeleteBook`, `upsertNote`, `deleteNote` all throw (books.ts:140/168, notes.ts:32/92). Verify UI surfaces an error.
- [ ] **T12 — Pull skips conflicted entities** — Cloud has a newer revision of the conflicted book; pull must NOT overwrite local; conflict stays until resolved.
- [ ] **T13 — Resolve → re-push → clean** — After resolving, entity returns to `synced`, outbox empties, cloud and local revisions match, no stuck state.
- [ ] **T14 — Cancel resolver** — Closing the resolver dialog leaves conflict `open`, sync status chip still shows `Conflicts(N)`.

### UI / notifications

- [ ] **T15 — Toast + chip** — Creating a conflict fires the sonner toast (SyncEngine.ts:155), chip shows `Conflicts(N)`, and clicking the toast/chip opens the inbox.
- [ ] **T16 — Multiple concurrent conflicts** — Two books conflicted at once → inbox lists both, resolving one doesn't touch the other.
- [ ] **T17 — Retry/promote CAS edge** — A promote push hitting an existing row fails as *permanent* (not a stuck `open` conflict); entity marked `failed` with a visible Retry path.
