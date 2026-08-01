import { v4 as uuidv4 } from "uuid";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";
import { getDb } from "@/lib/dexie/db";
import type { BookEntry, NoteEntry, FileEntry, ImageEntry } from "@/lib/dexie/types";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

async function uploadBook(
  title: string,
  author: string,
  tags: string[],
  isFavourite: boolean,
  image: File | null,
  file: File,
  syncToCloud: boolean,
) {
  const db = getDb();
  const docId = uuidv4();
  const fileId = uuidv4();
  let imageId: string | null = null;
  if (image) imageId = uuidv4();

  const user = await AuthAPI.getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  const now = Date.now();

  try {
    await db.files.add({
      fileId,
      file,
    });

    if (image && imageId) {
      await db.images.add({
        imageId,
        image,
      });
    }

    await db.books.add({
      id: docId,
      title,
      author,
      tags,
      fileId,
      imageId,
      isFavourite,
      syncScope: syncToCloud ? "cloud" : "local",
      revision: 0,
      baseRevision: 0,
      deletedAt: null,
      fileSyncStatus: "present",
      coverSyncStatus: image ? "present" : "not_downloaded",
      syncStatus: syncToCloud ? "pending" : "synced",
      updatedAt: now,
      updatedByDeviceId: "",
    });

    if (syncToCloud) {
      await db.outbox.add({
        entityType: "book",
        entityId: docId,
        op: "upsert",
        payload: {
          title,
          author,
          tags,
          fileId,
          isFavourite,
          imageId,
        },
        baseRevision: 0,
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
      });
    }
  } catch (error) {
    console.error("Error uploading book:", error);
    try {
      await db.files.where("fileId").equals(fileId).delete();
      await db.books.where("id").equals(docId).delete();
    } catch (cleanupError) {
      console.error("Error cleaning up local storage:", cleanupError);
    }
    throw error;
  }
}

async function listCloudBooks() {
  const db = getDb();
  try {
    const books = await db.books
      .where("syncScope")
      .equals("cloud")
      .and((b) => b.deletedAt === null)
      .toArray();
    return books;
  } catch (error) {
    throw new Error(
      `Failed to fetch cloud books: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function listLocalBooks() {
  const db = getDb();
  try {
    const books = await db.books
      .where("deletedAt")
      .equals(null as unknown as number)
      .toArray();
    return books;
  } catch (error) {
    throw new Error(
      `Failed to fetch local books: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function getlocalBook(fileId: string) {
  const db = getDb();
  try {
    const file = await db.files.where("fileId").equals(fileId).first();
    return file?.file || null;
  } catch (error) {
    throw new Error(
      `Failed to fetch book file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function getlocalImage(imageId: string | null | undefined) {
  if (!imageId) {
    return null;
  }
  const db = getDb();
  try {
    const imageEntry = await db.images.where("imageId").equals(imageId).first();
    return imageEntry?.image || null;
  } catch (error) {
    throw new Error(
      `Failed to fetch book image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function downloadBook(docId: string) {
  const db = getDb();
  const user = await AuthAPI.getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  const book = await db.books.where("id").equals(docId).first();
  if (!book) {
    throw new Error("Book not found locally");
  }

  if (book.fileSyncStatus === "present") {
    return;
  }

  await db.books.where("id").equals(docId).modify({
    fileSyncStatus: "downloading",
  });

  try {
    const { data: fileData, error: fileError } = await supabase.storage
      .from(FILE_NAME)
      .download(`${user.id}/${docId}/${book.fileId}.pdf`);

    if (fileError) {
      throw new Error(`Failed to download book: ${fileError.message}`);
    }

    await db.files.add({
      fileId: book.fileId,
      file: fileData,
    });

    await db.books.where("id").equals(docId).modify({
      fileSyncStatus: "present",
    });
  } catch (error) {
    await db.books.where("id").equals(docId).modify({
      fileSyncStatus: "failed",
    });
    throw error;
  }
}

async function deleteBook(docId: string) {
  const db = getDb();

  const book = await db.books.where("id").equals(docId).first();
  if (!book) {
    throw new Error("Book not found");
  }

  const now = Date.now();

  if (book.syncScope === "cloud") {
    await db.books.where("id").equals(docId).modify({
      deletedAt: now,
      syncStatus: "pending",
      updatedAt: now,
    });

    await db.outbox.add({
      entityType: "book",
      entityId: docId,
      op: "delete",
      payload: {},
      baseRevision: book.baseRevision,
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
    });
  } else {
    await db.files.where("fileId").equals(book.fileId).delete();
    if (book.imageId) {
      await db.images.where("imageId").equals(book.imageId).delete();
    }
    await db.books.where("id").equals(docId).delete();
  }
}

async function updateBookMetadata(
  docId: string,
  updates: {
    title?: string;
    author?: string;
    tags?: string[];
    isFavourite?: boolean;
  },
) {
  const db = getDb();
  const now = Date.now();

  const book = await db.books.where("id").equals(docId).first();
  if (!book) {
    throw new Error("Book not found");
  }

  await db.books.where("id").equals(docId).modify({
    ...updates,
    updatedAt: now,
  });

  if (book.syncScope === "cloud") {
    await db.books.where("id").equals(docId).modify({
      syncStatus: "pending",
    });

    await db.outbox.add({
      entityType: "book",
      entityId: docId,
      op: "upsert",
      payload: updates,
      baseRevision: book.baseRevision,
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
    });
  }

  return { id: docId, ...updates };
}

async function deleteLocalBook(docId: string) {
  const db = getDb();
  try {
    const book = await db.books.where("id").equals(docId).first();

    if (!book) {
      throw new Error("Book not found");
    }

    await db.files.where("fileId").equals(book.fileId).delete();
    if (book.imageId) {
      await db.images.where("imageId").equals(book.imageId).delete();
    }
    await db.books.where("id").equals(docId).delete();
  } catch (error) {
    console.error("Error deleting local book:", error);
    throw new Error(
      `Failed to delete book: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

const BooksAPI = {
  uploadBook,
  listLocalBooks,
  listCloudBooks,
  getlocalBook,
  getlocalImage,
  downloadBook,
  deleteBook,
  deleteLocalBook,
};

export default BooksAPI;
