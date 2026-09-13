# Sync QA Checklist — Multi-Device Manual Testing

Manual test checklist for daily-use confidence. Two devices (or two browser profiles) required.
Check off each item as it passes.

## Legend

- `[ ]` not yet run
- `[x]` passed
- `[!]` failed / bug found

---

## Cross-device core

> **Test methodology for merge/conflict cases:** the 500ms debounce + 60s interval sync too fast to land both edits at the same base revision manually. Put **both** devices offline, make both edits, then bring them online one at a time.

- [x] **C1 — Create cloud book on A → appears on B** — Create a book on Device A with sync enabled. After a sync cycle on B, the book's metadata and cover appear on B.
- [x] **C2 — Open on B downloads PDF** — Open a cloud book on Device B that has no local PDF. The viewer should download the file on open.
- [x] **C3 — Edit title A / tags B → merge or inbox** — Edit the title on A and tags on B (same base rev). Push both; first wins, second triggers auto-merge or conflict inbox.
- [ ] **C4 — Edit note both → inbox** — Edit the note on both devices. After sync, a `note_body` conflict appears in the inbox on both. *(Blocked — NoteEditor not wired into UI; `src/features/Note/_components/NoteEditor.tsx` is a placeholder and commented out in the reader page.)*
- [x] **C5 — Delete on A → gone on B** — Soft-delete a cloud book on A. After A pushes and B pulls, the book disappears from B's library.
- [x] **C6 — Offline delete A + offline edit B → conflict UX** — Device A goes offline, deletes a book. Device B goes offline, edits the same book. Both come online and push → `update_vs_delete` conflict inbox.
- [x] **C7 — Local book stays on A only** — Create a local-only book on A. Never promote. B never sees it.
- [x] **C8 — Promote local → appears on B** — Promote a local-only book on A. After sync, B sees the book (meta + cover).
- [x] **C9 — User switch on same browser → isolation** — Sign in as User 1, create books. Sign out, sign in as User 2. User 2 sees only their own books.

## Session & offline

- [ ] **S1 — Expire session offline → banner, local edit queues, re-auth drains** — Kill network, wait for session to expire. Banner appears. Make a local edit (queues in outbox). Reconnect and re-auth → sync drains the outbox.
- [ ] **S2 — Expired session blocks sync/promote** — With expired session: manual "Sync now" button disabled, Promote action disabled, banner persists.
- [ ] **S3 — Re-auth after offline SIGNED_OUT** — Sign out while offline, stay in dashboard. Sign in again online → sync resumes.

## Progress sync

- [ ] **P1 — Toggle off (default) — no progress sync** — With progress sync off: read to page 50 on A, page 30 on B. No outbox entries, no cloud writes for reading states.
- [ ] **P2 — Toggle on → progress syncs** — Enable progress sync on both devices. Read to page 50 on A, page 30 on B. After sync: both devices show page 50 (max merge).
- [ ] **P3 — Progress never regresses** — With progress sync on: set A to page 100, sync, then set B to page 10 and sync. A stays at page 100 (max merge).

## Delete & restore

- [x] **D1 — Recently deleted appears, restore works** — Soft-delete a cloud book. It appears in Recently Deleted. Restore it → book reappears in library with correct sync status. *(Fix shipped (see session log #3–#5); re-verified: cover + PDF both restore correctly on the other device.)*
- [x] **D2 — Remove download ≠ delete library** — Use "Remove download" on a cloud book. The PDF blob is removed but the book remains in the library.
- [x] **D3 — Delete propagation** — Delete on A, verify outbox entry created, push succeeds, pull on B shows tombstone (book gone).

## Conflict scenarios (Phase 7 backlog)

### Detection & auto-merge

- [x] **T3 — Field clash + resolver** — Both edit title, different fields, favourites → only clashing field shows in `FieldClashResolver`; remote snapshot is camelCase; resolve re-enqueues.
- [x] **T5 — Auto-merge non-overlapping meta** — Device A edits title, Device B edits author (same base rev). Push succeeds, no conflict, local converges.
- [x] **T6 — Tags auto-union** — Both devices change tags → tags are unioned, no user conflict.
- [x] **T7 — Favourite LWW** — Both toggle favourite → winner by higher revision, auto-merged, no conflict.

### Resolvers

- [ ] **T8 — Note body conflict** — Both edit note → `note_body` conflict → `NoteBodyResolver` opens, pick mine/theirs → winner pushes with `baseRevision = remote.revision`.
- [x] **T9 — Update vs delete (Restore)** — Edit book on A, delete on cloud → `UpdateVsDeleteResolver` → **Restore** → book returns, re-enqueued upsert succeeds.
- [x] **T10 — Update vs delete (Confirm Delete)** — Same setup → **Confirm Delete** → book soft-deleted, delete pushed, cloud converges.

### Blocking & interaction safety

- [x] **T11 — Edits blocked while conflicted** — While conflict open: `updateBook`, `softDeleteBook`, `upsertNote`, `deleteNote` all throw (books.ts:140/168, notes.ts:32/92). Verify UI surfaces an error. *(Run 3: book-edit path surfaces conflict toast; delete path swallowed to generic "Failed to delete book" — low-severity UX finding. Note ops N/A — no note UI.)*
- [x] **T12 — Pull skips conflicted entities** — Cloud has a newer revision of the conflicted book; pull must NOT overwrite local; conflict stays until resolved.
- [x] **T13 — Resolve → re-push → clean** — After resolving, entity returns to `synced`, outbox empties, cloud and local revisions match, no stuck state. *(Run 3: resolving from a stale baseRevision re-clashed once — second field_clash resolved, then converged clean.)*
- [x] **T14 — Cancel resolver** — Closing the resolver dialog leaves conflict `open`, sync status chip still shows `Conflicts(N)`.

### UI / notifications

- [x] **T15 — Toast + chip** — Creating a conflict fires the sonner toast (SyncEngine.ts:155), chip shows `Conflicts(N)`, and clicking the toast/chip opens the inbox.
- [ ] **T16 — Multiple concurrent conflicts** — Two books conflicted at once → inbox lists both, resolving one doesn't touch the other.
- [ ] **T17 — Retry/promote CAS edge** — A promote push hitting an existing row fails as *permanent* (not a stuck `open` conflict); entity marked `failed` with a visible Retry path.

## Session log (qa run 2026-09-13)

Run 1 — Passed: C1, C2, C3, C5, C6, T9. Blocked: C4 (no note editor in UI).

Run 2 (quick-win set) — Passed: C7, C9, D1, D2, D3, C8, T7, T10. T10 informally verified (practised on the running app).

Run 3 (conflict-suite, 2026-09-14) — Passed: T15, T11, T12, T13, T14.

Run-3 notes:

- **T13 re-clash on resolve (expected).** T12 left a newer cloud revision (A edited tags) while B's conflict was open, so B's first resolve pushed from a stale `baseRevision` → RPC `revision mismatch` → a second `field_clash` appeared; resolving again (now-current remote rev) converged clean.
- **T11 delete toast is generic.** Book-edit path surfaces `Resolve the conflict on this book first` via EditBookDialog; delete path swallows the conflict message and shows only `Failed to delete book` (dashboard/page.tsx:115-126). Low-severity UX finding.
- **T11 note-ops unverifiable.** `upsertNote`/`deleteNote` conflict guards exist (notes.ts:32/92) but no note UI is wired, so only book edit/delete paths were exercised.

Run-2 notes:

- **C9 residue / stale per-user DBs.** The C9 user-switch test leaves multiple `bookVaultDB:<id>` databases behind on the same browser profile. A "Remove download"/delete investigated during D2 was found to belong to the *other* user's stale DB (book "asdasd", still with blob `812dbe78…`) while the current session's DB used `95bbebf5…`. This is expected isolation behavior, not a bug.
- **DevTools "Offline" throttling breaks the page** (assets won't load on reload); for offline phases use the OS network toggle (both devices together) or per-profile DevTools Network request-blocking of `*supabase.co*` (required when staggering devices one-at-a-time, as in T7/T10).

Fixes shipped during this run:

1. **Pull changes required a manual refresh.** `SyncEngine.runCycle()` wrote pulled data to Dexie but never invalidated React Query. Fixed by extracting a shared `queryClient` singleton (`src/lib/queryClient.ts`) used by both `QueryProvider` and `SyncEngine` (invalidates after each successful cycle).
2. **Restore did not return the book to other devices.** `cas_upsert_book` / `cas_upsert_note` update branches never cleared `deleted_at`, so a resolved update-vs-delete "Restore" left the cloud row as a tombstone → other devices kept treating it as deleted. Fixed in `supabase/migrations/0003_restore_clears_deleted_at.sql` (`deleted_at = NULL` on update; applied via `supabase db push`).
3. **Tombstone apply left stale blob statuses.** On the receiving device, `applyBook` tombstone branch (existing row) removed file/image blobs but never reset `fileSyncStatus`/`coverSyncStatus` → cover never re-downloaded and PDF showed a revoked-blob-URL error after restore. Fixed in `src/features/sync/pull.ts` (both statuses set to `not_downloaded`) and `src/lib/books.ts` `restoreBook` (defensive reset).
4. **Restore failed when a pending delete outbox entry existed.** `restoreBook` called plain `enqueue(upsert)`, which throws when a `delete` entry is pending for the same entity. Fixed by adding an `allowUpsertAfterDelete` flag to `src/lib/outbox.ts`; `restoreBook` now replaces the pending delete with the restore upsert. (`tests/restore.test.ts` added.)
5. **Reader page blob-URL revocation race.** `fetchFileBlob` depended on the `selectedBook` object reference → query invalidations (engine write → refetch) re-ran the fetch and revoked the blob URL while pdf.js was still loading it → "Unexpected server response (0)". Fixed by keying the auto-fetch effect on stable fields (`fileId`, `syncScope`) and deferring revocation of superseded blob URLs. (`src/app/dashboard/book/[bookId]/page.tsx`)
