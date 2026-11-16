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
- [ ] **C4 — Edit note both → inbox** — Edit the note on both devices. After sync, a `note_body` conflict appears in the inbox on both. *(NoteEditor now wired into the reader page (2026-09-14) — was previously a placeholder/commented out; runnable.)*
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

- [ ] **T8 — Note body conflict** — Both edit note → `note_body` conflict → `NoteBodyResolver` opens, pick mine/theirs → winner pushes with `baseRevision = remote.revision`. *(NoteEditor wired into reader page (2026-09-14) — runnable.)*
- [x] **T9 — Update vs delete (Restore)** — Edit book on A, delete on cloud → `UpdateVsDeleteResolver` → **Restore** → book returns, re-enqueued upsert succeeds.
- [x] **T10 — Update vs delete (Confirm Delete)** — Same setup → **Confirm Delete** → book soft-deleted, delete pushed, cloud converges.

### Blocking & interaction safety

- [x] **T11 — Edits blocked while conflicted** — While conflict open: `updateBook`, `softDeleteBook`, `upsertNote`, `deleteNote` all throw (books.ts:140/168, notes.ts:32/92). Verify UI surfaces an error. *(Run 3: book-edit path surfaces conflict toast; delete path swallowed to generic "Failed to delete book" — low-severity UX finding. Note ops now exercisable via NoteEditor (2026-09-14); re-run to verify note conflict toast.)*
- [x] **T12 — Pull skips conflicted entities** — Cloud has a newer revision of the conflicted book; pull must NOT overwrite local; conflict stays until resolved.
- [x] **T13 — Resolve → re-push → clean** — After resolving, entity returns to `synced`, outbox empties, cloud and local revisions match, no stuck state. *(Run 3: resolving from a stale baseRevision re-clashed once — second field_clash resolved, then converged clean.)*
- [x] **T14 — Cancel resolver** — Closing the resolver dialog leaves conflict `open`, sync status chip still shows `Conflicts(N)`.

### UI / notifications

- [x] **T15 — Toast + chip** — Creating a conflict fires the sonner toast (SyncEngine.ts:155), chip shows `Conflicts(N)`, and clicking the toast/chip opens the inbox.
- [ ] **T16 — Multiple concurrent conflicts** — Two books conflicted at once → inbox lists both, resolving one doesn't touch the other.
- [ ] **T17 — Retry/promote CAS edge** — A promote push hitting an existing row fails as *permanent* (not a stuck `open` conflict); entity marked `failed` with a visible Retry path.

## Daily-use completeness (Tier 0)

- [ ] **U1 — Reader resumes where you left off** — Read to page N on A, close the tab, reopen the same book. The viewer lands directly on page N with no banner or prompt.
- [ ] **U2 — Local search works offline** — With the network off, press `Ctrl/Cmd+K` and search for a title, author, tag, and a phrase that only appears in a note. "In your library" results open the book; no Open Library section is shown.
- [ ] **U3 — Library filters and sort persist** — Toggle the Favourites pill and select a tag, set the "Sort by" dropdown to Title, switch to list view, then reload. All preferences survive the reload. Clearing filters restores the full library, the empty-library vs. no-match states are distinct, and the sidebar lists Favourites (not All Books).
- [ ] **U4 — Delete/promote blocked by conflict explains itself** — With an open conflict on a book, try delete, promote, and remove-download. Each toast says "Resolve this book's sync conflict first".
- [ ] **U5 — Cover upload failure is not silent** — Force a storage upload error (e.g. block `*.supabase.co` storage requests). The push reports failure and the book stays unsynced with a visible retry path, instead of being marked synced without a cover object.
- [ ] **U6 — Pull does not skip rows behind a pending entity** — Make a local edit on A (queued), edit a *different* book on B, sync A. The second book appears on A, and A's cursor stays before the pending row until the outbox drains.

## Offline / PWA (browser)

> Service workers require a production build: run `npm run build && npm start`
> (`localhost` is a secure context). Registration is gated on
> `NODE_ENV === "production"` — `npm run dev` unregisters any existing worker and
> clears `vault-*` caches instead of caching HMR chunks.
>
> DevTools "Offline" is fine for shell/warm-cache checks. For anything involving
> Supabase (re-auth, sync drain) prefer the OS network toggle or per-profile
> request blocking of `*supabase.co*`.

- [ ] **O1 — Worker activates in production** — Load any page from `npm start`. DevTools → Application → Service Workers shows `/sw.js` **activated and running**, scope `/`. The Cache Storage pane shows `vault-shell-v3` plus `vault-runtime-v3`, and `vault-books-v3` once a book is downloaded.
- [ ] **O2 — Cold offline reload serves the shell** — Load `/dashboard` online once, then go offline and reload. The library, sidebar, filters and covers render; the "Your Library" header shows an `Offline` pill (no stale pill when the connection returns); no failed `_next` asset requests.
- [ ] **O3 — Cold offline start without a prior dashboard visit** — From a clean profile, load `/` online, then go offline and navigate to `/dashboard`. The shell still renders (documents are precached with their chunks).
- [ ] **O4 — Downloaded book opens offline** — "Download for offline" on a cloud book, wait for the toast, go offline, open it: PDF renders, notes and reading progress work. In the worker's console the warm step must not log `uncacheable response` — see session log #20.
- [ ] **O5 — Not-downloaded book offline** — Offline, click a cloud book that was never downloaded or warmed: a toast says it isn't downloaded yet and navigation does not happen. Opening that route directly (e.g. from history) shows the "This book isn't downloaded yet" screen with Retry.
- [ ] **O6 — Offline writes queue and drain** — Create/edit/delete a note and change reading progress offline; the chip reads `Offline · N queued`. Reconnect → outbox drains and the chip returns to `Synced`.
- [ ] **O7 — Expired session offline** — Expire the token (or stay offline long enough), reload: the re-auth banner appears but the library stays usable, and Download/Promote are disabled with "Sign in to …" titles.
- [ ] **O8 — Update toast** — Rebuild (`npm run build`), reload once online: "New version available" toast appears; clicking Reload activates the new worker (`controllerchange` reload) and no stale shell remains.
- [ ] **O9 — Downloaded filter** — Toggle the "Downloaded" pill: only books with a local blob are listed; the choice survives a reload; "Clear" resets it along with tags and favourites.
- [ ] **O10 — Storage reporting** — Settings → Sync → Offline storage shows used/quota and eviction protection. After a download the used figure grows; "Keep offline data" flips a best-effort profile to persistent when the browser allows it.
- [ ] **O11 — Quota failure copy** — With a nearly full profile (or by throttling storage), a download fails with "Not enough storage for this book" rather than a generic error, and the book keeps a visible retry path.
- [ ] **O12 — Offline UI when `navigator.onLine` lies** — In DevTools → Network → Offline (where `navigator.onLine` stays `true`), wait for the next sync cycle or attempt a download. The console shows `[SyncEngine] Offline, cycle skipped: …` as a **warning** (no red dev overlay), the sidebar chip reads `Offline` (not `Error`), and the "Your Library" pill appears. Going back online clears both without a reload.



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

## Session log (Tier 0 completeness, 2026-11-15)

Implemented the Tier 0 "daily-use completeness" set. No sync protocol changes; one behavioural change to pull cursors (item 10).

Fixes shipped:

6. **Reader never resumed.** The library had no way back to a saved position. `PDFViewer` now accepts `initialPage`, restores once per document via `rowVirtualizer.scrollToIndex` (works before `pageHeight` is measured), and suppresses `onPageChange` until the restore lands so page 1 cannot overwrite the saved page. The reader page loads `getReadingState` and passes it through — resume is silent (no banner or "start over" prompt).
7. **Search only hit Open Library.** `Ctrl/Cmd+K` required a network round-trip and could not find anything already in the vault. `searchLocal` (`features/Search/data/localSearch.ts`) scans local book metadata, tags, and note bodies with field-weighted scoring (exact > prefix > substring, multi-term fallback) and snippet extraction. `SearchLauncher` renders "In your library" always and "Open Library — online" only when online with a 3+ character query; local hits navigate to `/dashboard/book/<fileId>`.
8. **No library filters or sort.** Added `src/lib/library-prefs.ts` (localStorage, mirroring the `theme` precedent — deliberately not synced) and `LibraryFilterBar`: tag pills on the left, a "Sort by" dropdown (recently added / title / author) on the right, plus persisted grid/list view mode. The sidebar's "All Books" list is now "Favourites". "Recently added" uses a new optional `Book.createdAt` (set on local create, taken from the cloud row's `created_at` on pull, falling back to `updatedAt` for pre-existing rows) — Dexie's primary key is a UUID, so `toArray()` order carries no recency information. No Dexie index was added since sorting happens in memory.
9. **Generic error on conflict-blocked actions.** Delete, promote, and remove-download showed "Failed to …" when the repo guard threw an unresolved-conflict error. The dashboard now maps it to "Resolve this book's sync conflict first" (T11 finding, T17 retry path).
10. **Pull stalled on the first pending entity.** `pullBooks` / `pullNotes` / `pullReadingStates` used `break`, so one locally-edited row hid every later cloud row until the outbox drained. The cursor now stops *before* the blocked row (`blocked` flag) while later rows are still applied; `hasMore` is purely `rows.length === PAGE_SIZE`, and `count` reports only rows actually written. Notes/reading states for a not-yet-local book block rather than advance, so they are retried instead of skipped.
11. **Cover upload failures were silent.** `uploadImageIfMissing` logged a warning and returned, letting a book be marked synced with an `image_id` that has no storage object. It now throws `Image upload failed: …` so the push path classifies and retries it; a device with no local blob still returns quietly (metadata-only pull).

Verification: `npx tsc --noEmit`, `npm run test` (72 passing, incl. new `tests/localSearch.test.ts` and blocked-cursor cases in `tests/pull.test.ts`), and `npm run build` all clean.

Manual QA status: U1–U6 above are new and unrun. C4 and T8 are now runnable (NoteEditor is wired into the reader page); T17's retry path is now accompanied by the clearer conflict message. These still need a two-device pass.

## Session log (Tier 1.1 offline, 2026-11-15)

Implemented browser-native offline support. No new dependencies, no manifest
(installability is deferred to 1.1b — it does not change caching or offline
reading).

Shipped:

12. **Service worker re-enabled, production only.** `ServiceWorkerInit` is back in the root layout; `registerServiceWorker` registers `/sw.js` as a module worker only when `NODE_ENV === "production"`, and in dev unregisters existing workers and clears `vault-*` caches. Updates surface as a sonner "New version available" toast (SKIP_WAITING + `controllerchange` reload); update checks run on focus and every 10 min instead of every 60 s.
13. **Policy extracted and rewritten.** `public/sw-policy.js` is the single source of truth (plain ESM, imported by both the worker and `tests/sw-policy.test.ts`): cache-first for `/_next/static/*` and static files, network-first for documents and `_rsc` payloads, network-only for Supabase, `/api/*` and non-GETs. `CACHE_VERSION` moved to `v2` with separate `vault-shell-*` / `vault-runtime-*` caches, a 100-entry runtime trim, and an `/offline` route as the last-resort navigation fallback.
14. **Shell precache includes chunks.** Precaching documents without their build assets yields a blank page offline, so `install` also caches the `/_next/static/*` URLs referenced by each prerendered document.
15. **"Download for offline".** `ensureBookDownloaded` (with in-flight dedupe and classified `DownloadError`s) + `useDownloadBook`; `BookMenu` gains the action for cloud books, `BookCard` shows an offline/downloading badge, and `LibraryFilterBar` gains a persisted "Downloaded" pill.
16. **Route warming.** `router.prefetch` is not enough for a dynamic route: prefetch payloads are `Vary`-keyed and may be partial. After a download the client fetches the pdf.js worker and messages the service worker to cache the reader document plus every `_next/static` asset it references. Navigation fallback matching uses `ignoreVary`.
17. **Auth hardening.** `AuthContextValue.session` is now nullable (the cached-user path supplies `null`, which previously crashed `BookMenu`). Startup reads the session with a 2.5 s cap, treats an expired session as cached (banner), and falls back to the cached user — so a cold offline start cannot hang on "Loading...".
18. **Reactive connectivity.** New `useOnlineStatus` (`useSyncExternalStore`); the status chip now reads `Offline` / `Offline · N queued` instead of a stale `Pending(N)`, and `SyncNowButton` no longer reads `navigator.onLine` at render time. Settings reports storage usage/persistence, and the reader distinguishes "not downloaded yet" from a real download failure.
19. **Two-signal connectivity.** `navigator.onLine` is not trustworthy: on Windows it stays `true` behind virtual adapters (Hyper-V / WSL / VMware), VPN clients and idle Ethernet ports, and Chrome keeps it `true` under DevTools offline throttling. So `src/lib/connectivity.ts` combines the platform flag with real request outcomes: a failed request (`reportUnreachable`) flips the UI to offline even when the flag says online, and a successful pull/download (`reportReachable`) clears it. `getIsOnline()` answers the UI; `getNetworkAvailable()` answers "is it worth retrying", so a failed cycle can never wedge the retry loop. `isNetworkError` (`src/lib/network-error.ts`) unifies Chrome/Firefox/Safari/Node failure messages; the engine treats those as connectivity (`console.warn`, `status: "idle"`) instead of `error`, and the chip now orders conflicts → offline → error → syncing → paused → pending → synced.

20. **Warmed routes now survive `no-store`.** Found in the deployed build: clicking a downloaded book changed the URL, reloaded, and stayed on the library. Cause: Next serves every **dynamic** route (`/dashboard/book/[fileId]` has no `generateStaticParams`) with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, and `isCacheableResponse` rejected `no-store` — so `warmRoute` cached nothing, and offline `navigationFallbackPaths("/dashboard/book/…")` fell through to the precached `/dashboard` document. `isCacheableResponse` now takes `ignoreNoStore`, used for app documents, warmed routes, same-origin RSC payloads and `/_next/static` assets; third-party responses still respect `no-store`. Warm routes moved to their own `vault-books-*` cache that the 100-entry runtime trim never touches (it previously stored doc + chunks in the trimmed runtime cache), `warmRoute` verifies the entry actually landed, and "Remove download" posts `REMOVE_BOOK_ROUTE` so the stale route is dropped. `CACHE_VERSION` → `v3`. Because the bump wipes the old caches, `UserDbProvider` now calls `warmDownloadedBooks` on startup: every book with `fileSyncStatus: "present"` whose route is missing from cache is warmed again (once, online only), so books downloaded before the upgrade still open offline.

Verification: `npx tsc --noEmit`, `npm run test` (112 passing, incl. new
`tests/connectivity.test.ts`, `tests/sw-policy.test.ts` and `tests/download.test.ts`),
`npm run build` (route table confirms `/dashboard` and `/offline` are static; reader
route stays dynamic and is warmed per book). O1–O11 above are new and unrun — they
need a browser pass against `npm run build && npm start`.
