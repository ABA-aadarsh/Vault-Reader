# Sync QA Checklist — Phase 7 (Conflicts)

Manual test checklist to complete before Phase 8. Check off each item as it passes.

## Legend

- `[ ]` not yet run
- `[x]` passed
- `[!]` failed / bug found

---

## Already approved

- [x] **T3 — Field clash + resolver** — Both edit title, different fields, favourites → only clashing field shows in `FieldClashResolver`; remote snapshot is camelCase; resolve re-enqueues.

---

## Conflict scenarios

### Detection & auto-merge

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

---

## Blocking / non-goals for Phase 8

- Progress max-merge is Phase 10 (toggle off by default) — skip.
- Notification "tap to resolve" focuses inbox — covered as part of T15.