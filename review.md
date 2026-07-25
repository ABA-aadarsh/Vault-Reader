# Vault Reader — Codebase Review

## Project Overview

Vault Reader is a **cross-platform, offline-first e-book reader** built with **Next.js 15 + React 19 + TypeScript**. It allows users to manage a personal library of PDF books with cloud sync via Supabase, a rich note-taking system, and a built-in PDF viewer.

---

## Core Features (Working)

1. **Authentication** — Supabase email/password auth with `RequireAuth` route guard
2. **Book Library** — Upload, grid/list view, drag-and-drop, delete with confirmation
3. **PDF Viewer** — Virtualized rendering, zoom, rotate, fullscreen, page navigation
4. **Note-Taking** — MDX WYSIWYG editor with custom page buttons and quote directives
5. **Offline-First Sync** — Dexie (IndexedDB) local storage + queue-based Supabase cloud sync
6. **Search** — Command palette (Ctrl+K) querying Open Library API

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, shadcn/ui (New York style) |
| State | TanStack React Query v5, React Context |
| Local Storage | Dexie.js v4 (IndexedDB) |
| Cloud | Supabase (Auth, Database, Storage) |
| PDF | react-pdf v10 + @tanstack/react-virtual |
| Notes | @mdxeditor/editor v3.40 |
| Forms | react-hook-form v7 + Zod v4 |

---

## Architecture

### Feature-Based Modules (`src/features/`)

```
features/
├── supabase/          # Backend integration (auth, books, sync services)
├── Books/             # Book management UI, hooks, providers
├── PDFViewer/         # PDF rendering with virtualization
├── Note/              # Rich MDX note editor
├── PDFAndNoteViewer/  # Split view (broken/in-progress)
├── Search/            # Command palette search
└── BookSearch/        # Open Library API client
```

### Provider Hierarchy

```
Root Layout → QueryProvider
  └─ Dashboard Layout → RequireAuth → SearchLauncherProvider → BookAddProvider → SidebarProvider
```

### Service Layer

- `AuthAPI` — signup, signin, signout, getCurrentUser, localStorage caching
- `BooksAPI` — upload, list, get, delete, update, download
- `SyncManager` — queue-based offline sync with push/pull to Supabase

### Database Schema (Dexie/IndexedDB)

| Table | Primary Key | Purpose |
|-------|------------|---------|
| `files` | `++id` | Stores book file blobs |
| `metadata` | `docId` | Book metadata (title, author, tags, sync status) |
| `image` | `++id` | Stores cover image blobs |
| `syncQueue` | `++id` | Queued create/update/delete operations |

---

## Partially Done / Stubbed

- **PDFAndNoteViewer** — split view component is broken (empty provider, missing props)
- **Settings page** — Profile works, but Notifications/Security/Appearance are UI-only
- **Sidebar** — uses hardcoded mock data instead of real books
- **Service Worker** — implemented but disabled (was caching API calls)
- **Appwrite SDK** — installed but never used (planned alternative backend)

---

## Missing

- **No tests** — no test files, no testing libraries, no test scripts
- **No CI/CD** pipeline
- **Search results** don't link anywhere yet
- **Theme switching** UI exists but isn't wired up
- **No API/architecture documentation**

---

## Notable Issues

1. `.env` with Supabase credentials may be committed despite `.gitignore`
2. `ignoreBuildErrors: true` in `next.config.ts` — build errors are silently ignored
3. `deleteBook` has an incomplete local auth TODO
4. Duplicate search effect in `SearchLauncher.tsx`
5. `downloadBook` has a logic bug (inverted image existence check)
6. Some unused imports in source files

---

## Application Flow

1. User visits `/` — sees landing page with hero and feature descriptions
2. User signs up/in at `/signup` or `/signin` — form validated with Zod, auth via Supabase
3. Redirected to `/dashboard` — protected by `RequireAuth`; sidebar loads
4. Dashboard shows library — books loaded from local Dexie DB, images as blob URLs
5. User adds a book — via "Add Book" button or drag-and-drop; stored locally; queued for sync
6. If online — sync manager uploads file/image to Supabase Storage, inserts metadata into DB
7. User clicks a book card — navigates to `/dashboard/book/[bookId]`; PDFViewer renders
8. PDF Viewer — virtualized scrolling, zoom, rotate, fullscreen, download, page navigation
9. Note editor — available via MDXEditor with rich formatting and custom JSX components
10. Search — Ctrl+K opens command palette; queries Open Library API with debounce

---

## Design Philosophy

- **Adwaita-inspired** UI (GNOME design language)
- **Dark mode by default**
- Clean, minimal, distraction-free interface
- Offline-first with eventual consistency to the cloud

---

*Review generated for Vault Reader project at `E:\codes\Vault-Reader`*
