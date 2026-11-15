import type { BookVaultDexie } from "@/data/dexie/schema";
import type { Book } from "@/data/domain";

export interface LocalBookHit {
  kind: "book";
  bookId: string;
  fileId: string;
  title: string;
  author: string;
  score: number;
}

export interface LocalNoteHit {
  kind: "note";
  bookId: string;
  fileId: string;
  title: string;
  author: string;
  snippet: string;
  score: number;
}

export type LocalSearchHit = LocalBookHit | LocalNoteHit;

const DEFAULT_LIMIT = 8;
const SNIPPET_RADIUS = 60;

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Score a field against the query.
 * Exact match > prefix > substring, offset by the field's weight so that
 * title hits always outrank author hits, and so on.
 */
function fieldScore(
  value: string | null | undefined,
  query: string,
  weight: number,
): number {
  if (!value) return 0;
  const haystack = normalize(value);
  if (!haystack) return 0;

  if (haystack === query) return weight + 20;
  if (haystack.startsWith(query)) return weight + 10;
  if (haystack.includes(query)) return weight;

  // Multi-term fallback: every term must appear somewhere in the field.
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length > 1 && terms.every((term) => haystack.includes(term))) {
    return Math.max(weight - 10, 1);
  }

  return 0;
}

function buildSnippet(body: string, query: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const index = normalize(flat).indexOf(query);
  if (index === -1) {
    return flat.length > SNIPPET_RADIUS * 2
      ? `${flat.slice(0, SNIPPET_RADIUS * 2)}…`
      : flat;
  }

  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(flat.length, index + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < flat.length ? "…" : "";

  return `${prefix}${flat.slice(start, end)}${suffix}`;
}

/**
 * Search the local library (book metadata, tags, and note bodies).
 *
 * Everything lives in IndexedDB, so this works offline. The library is a
 * personal collection (hundreds of rows), so an in-memory scan is cheaper and
 * far simpler than maintaining additional Dexie indexes.
 */
export async function searchLocal(
  db: BookVaultDexie,
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<LocalSearchHit[]> {
  const normalized = normalize(query);
  if (!normalized) return [];

  const books = (await db.books.toArray()).filter(
    (book: Book) => book.deletedAt === null,
  );
  const booksById = new Map(books.map((book) => [book.id, book]));

  const best = new Map<string, LocalSearchHit>();

  const consider = (hit: LocalSearchHit) => {
    const existing = best.get(hit.bookId);
    if (!existing || hit.score > existing.score) {
      best.set(hit.bookId, hit);
    }
  };

  for (const book of books) {
    const score = Math.max(
      fieldScore(book.title, normalized, 60),
      fieldScore(book.author, normalized, 40),
      ...book.tags.map((tag) => fieldScore(tag, normalized, 30)),
    );

    if (score > 0) {
      consider({
        kind: "book",
        bookId: book.id,
        fileId: book.fileId,
        title: book.title,
        author: book.author,
        score,
      });
    }
  }

  const notes = await db.notes.toArray();
  for (const note of notes) {
    if (note.deletedAt !== null) continue;

    const book = booksById.get(note.bookId);
    if (!book) continue;

    const score = fieldScore(note.body, normalized, 20);
    if (score === 0) continue;

    consider({
      kind: "note",
      bookId: note.bookId,
      fileId: book.fileId,
      title: book.title,
      author: book.author,
      snippet: buildSnippet(note.body, normalized),
      score,
    });
  }

  return Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
