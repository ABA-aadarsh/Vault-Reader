# Vault Reader — Codebase Review

> Snapshot reviewed Sep 2026 — reflects current state after sync Phases 0–11.

## Project Overview

Vault Reader is a **cross-platform, offline-first e-book reader** built with **Next.js 15 + React 19 + TypeScript**. Users manage a personal library of PDF books with a **cloud-coordinated multi-master sync system** (Supabase = merge hub), a rich MDX note system, and a built-in virtualized PDF viewer.


---

## Core Features (Working)

1. **Authentication** — Supabase email/password with `RequireAuth` route guard, offline session caching, and `SessionExpiryBanner` re-auth prompt
2. **Book Library** — Add (upload/drag-drop), grid/list view, edit, promote local→cloud, remove download, soft delete + 30-day restore (Recently deleted)
3. **PDF Viewer** — Virtualized rendering, zoom, rotate, fullscreen, page navigation, lazy cloud download on open
4. **Note-Taking** — MDX editor (autosave) with page-reference buttons and quote directives
5. **Offline-First Sync** — Single `SyncEngine` orchestration: coalesced outbox → CAS push → cursor pull → file planner
6. **Conflict Handling** — Policy-based auto-merge + conflict inbox (field clash, note body, update-vs-delete resolvers)
7. **Progress Sync** — Optional global reading-progress sync (off by default, monotonic max merge)
8. **Search** — Command palette (Ctrl+K) querying Open Library API

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, shadcn/ui (New York, stone) |
| State | TanStack React Query v5, React Context, `useSyncExternalStore` (sync status) |
| Local Storage | Dexie.js v4 (IndexedDB, per-user DB `bookVaultDB:${userId}`) |
| Cloud | Supabase (Auth, Postgres, Storage) |
| PDF | react-pdf v10 + @tanstack/react-virtual |
| Notes | @mdxeditor/editor |
| Tests | Vitest + fake-indexeddb |
| Forms | react-hook-form v7 + Zod v4 |

---

## Architecture

### Feature-Based Modules (`src/features/`)

```
features/
├── supabase/          # Auth (RequireAuth, auth.service) + storage
├── sync/              # SyncEngine, push/pull/filePlanner/policy/conflicts
├── sync/resolvers/    # FieldClash, NoteBody, UpdateVsDelete resolvers
├── Books/             # Book management UI, hooks, providers
├── PDFViewer/         # PDF rendering with virtualization
├── Note/              # Rich MDX note editor
├── Search/            # Command palette (Ctrl+K)
└── BookSearch/        # Open Library API client
```

### Provider Hierarchy

```
Root Layout → QueryProvider
  └─ Dashboard Layout → RequireAuth → UserDbProvider → SearchLauncherProvider → BookAddProvider → SidebarProvider
```

### Service / Data Layer (`src/lib/`)

- **Dexie layer** — `dexie/db.tsx` (per-user factory + `UserDbProvider`), `dexie/schema.ts`, `dexie/types.ts`
- **Local repos (standalone functions)** — `books.ts`, `notes.ts`, `readingState.ts`, `files.ts`, `images.ts`, `settings.ts`
- **Sync plumbing** — `outbox.ts` (coalescing enqueue), plus `features/sync/*` (engine, push, pull, policy, conflicts, filePlanner)
- **Domain** — `domain.ts` (Book / Note / ReadingState) + `mappers.ts`

### Sync subsystem (`src/features/sync/`)

| Module | Responsibility |
|--------|---------------|
| `SyncEngine.ts` | `runCycle` (push → pull → file planner) with mutex, triggers, scheduling, status store |
| `push.ts` | Outbox draining, CAS RPCs, error classification, exponential backoff |
| `pull.ts` | Cursor-based book/note pull + snapshot/tombstone apply |
| `filePlanner.ts` | Eager cover download, lazy PDF download |
| `policy.ts` | `attemptAutoMerge` (field merge, tags set-union, LWW favourite) |
| `conflicts.ts` | Conflict CRUD + resolve/restore/confirm-delete |
| `SyncStatusChip` / `SyncNowButton` / `SessionExpiryBanner` | UI surfaces |

### Cloud schema (Supabase)

- `books`, `notes`, `reading_states` tables + RLS + cursor indexes
- CAS RPCs: `cas_upsert_book`, `cas_upsert_note` (SECURITY DEFINER)
- Storage buckets `books` + `image`; path prefix `{userId}/{bookId}/...`
- Migrations: `0001_sync_v1.sql`, `0002_wipe_old_data.sql`, `0003_restore_clears_deleted_at.sql`

---

## Partially Done / Stubbed

- **Search palette** — results open the Open Library book page in a new tab; no local-book search yet
- **Theme switching** — selector in settings works (persisted to localStorage); landing page stays dark by default
- **Service Worker** — implemented (`public/sw.js`) but deliberately **disabled** (it was caching API responses)
- **Note page buttons** — navigate the PDF viewer to the referenced page; editor-only insert, no editing existing buttons

---

## Known Gaps / Open Items

- **Server tombstone GC** — solved in Phase 8.5 (`0004_tombstone_gc.sql`: pg_cron daily job + SECURITY DEFINER `purge_expired_tombstones()` removing rows > 30 days and their storage objects)
- **No CI/CD pipeline**
- **No API/architecture docs** beyond `plan.md`
- **Phase 12 roadmap** — CRDT notes, Supabase Realtime wake-up, Replace PDF, per-book progress, E2E encryption, guest→account migration

## Notable Issues (historical, now resolved)

1. ~~`ignoreBuildErrors: true`~~ — now `false`; `tsc --noEmit` is clean.
2. ~~No test runner~~ — Vitest + fake-indexeddb; 7 suites passing (~59 tests).
3. ~~Appwrite SDK~~ — uninstalled.
4. ~~`PDFAndNoteViewer` split view~~ — deleted.
5. ~~Old `syncManager.ts` / `book.service.ts`~~ — deleted; replaced by `SyncEngine` + local repos.
6. ~~`deleteBook` local auth TODO~~ — no longer present.

---

## Application Flow

1. User visits `/` — landing page with hero, features section, and footer
2. User signs up/in at `/signup` or `/signin` — Zod-validated forms, Supabase auth
3. Redirected to `/dashboard` — protected by `RequireAuth`; sidebar loads real library data
4. Dashboard shows library — books loaded from per-user Dexie DB, covers as blob URLs
5. User adds a book — stored locally; promoted to cloud (default) or kept local-only
6. Sync engine — coalesced outbox → CAS push → cursor pull → eager covers / lazy PDFs; conflicts surface in the inbox
7. Reader at `/dashboard/book/[bookId]` — downloads missing cloud PDFs on open; `PDFViewer` renders
8. Note editor — MDX with autosave; page-reference buttons jump the viewer
9. Progress sync (optional) — max(page)/max(percent) merge
10. Search (Ctrl+K) — Open Library lookup with debounce; results open in a new tab

---

## Design Philosophy

- **Adwaita-inspired** UI (GNOME design language)
- **Dark mode by default**
- Clean, minimal, distraction-free interface
- Offline-first with eventual consistency to the cloud

---

*Review snapshot generated for Vault Reader at `E:\codes\Vault-Reader` — Sep 2026.*