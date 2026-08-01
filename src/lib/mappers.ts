import { BookEntry, NoteEntry, ReadingStateEntry } from "./dexie/types";
import { Book, Note, ReadingState } from "./domain";

export function bookToDomain(entry: BookEntry): Book {
  return { ...entry };
}

export function bookToDexie(book: Book): BookEntry {
  return { ...book };
}

export function noteToDomain(entry: NoteEntry): Note {
  return { ...entry };
}

export function noteToDexie(note: Note): NoteEntry {
  return { ...note };
}

export function readingStateToDomain(entry: ReadingStateEntry): ReadingState {
  return { ...entry };
}

export function readingStateToDexie(state: ReadingState): ReadingStateEntry {
  return { ...state };
}
