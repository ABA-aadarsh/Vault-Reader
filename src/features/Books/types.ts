import type { Book } from "@/data/domain";

export interface BookViewModel {
  title: string;
  author: string;
  tags: string[];
  fileId: string;
  docId: string;
  isFavourite?: boolean;
  note?: string;
  image?: string | null;
  imageId?: string | null;
  syncStatus?: Book["syncStatus"];
  syncScope?: Book["syncScope"];
  fileSyncStatus?: Book["fileSyncStatus"];
}

export function toBookViewModel(book: Book): BookViewModel {
  return {
    title: book.title,
    author: book.author,
    tags: book.tags,
    fileId: book.fileId,
    docId: book.id,
    isFavourite: book.isFavourite,
    imageId: book.imageId,
    syncStatus: book.syncStatus,
    syncScope: book.syncScope,
    fileSyncStatus: book.fileSyncStatus,
  };
}
