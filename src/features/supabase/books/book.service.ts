import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/dexie"; // your Dexie IndexedDB setup
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";
import { Verified } from "lucide-react";
import { COMMON_STATE_CONFIG_EXTENSIONS } from "@mdxeditor/editor";
import { syncManager } from "../sync/syncManager";

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
  const docId = uuidv4();
  const fileId = uuidv4();
  let imageId: string | null = null;
  if (image) imageId = uuidv4();

  const user = await AuthAPI.getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  const userId = user.id;

  console.log({
    file,
  });

  try {
    // Upload file to local IndexedDB
    await db.files.add({
      fileId,
      file,
    });

    //upload image to local indexdb
    if (image) {
      await db.image.add({
        imageId,
        image,
      });
    }

    // Upload metadata to local IndexedDB
    await db.metadata.add({
      docId: docId,
      title,
      author,
      tags,
      fileId: fileId,
      userId: userId,
      isFavourite,
      imageId,
      syncStatus: syncToCloud ? "pending" : "synced",
    });

    if (syncToCloud) {
      // Queue the operation for syncing instead of direct cloud write
      await syncManager.queueOperation("create", docId, {
        title,
        author,
        tags,
        fileId,
        isFavourite,
        imageId,
      });
    }
  } catch (error) {
    console.error("Error uploading book:", error);
    // Clean up local storage if needed
    try {
      await db.files.where("fileId").equals(fileId).delete();
      await db.metadata.where("docId").equals(docId).delete();
    } catch (cleanupError) {
      console.error("Error cleaning up local storage:", cleanupError);
    }
    throw error;
  }
}

async function listCloudBooks() {
  try {
    const user = await AuthAPI.getCurrentUser();
    if (!user) {
      throw new Error("User not found");
    }
    const userId = user.id;
    console.log({ userId });
    const { data, error } = await supabase
      .from("metadata")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to fetch books from cloud: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      `Failed to fetch books from cloud: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function listLocalBooks() {
  try {
    const books = await db.metadata.toArray();
    return books;
  } catch (error) {
    throw new Error(
      `Failed to fetch books from local storage: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function getlocalBook(fileId: string) {
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
  try {
    const imageEntry = await db.image.where("imageId").equals(imageId).first();
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
  const user = await AuthAPI.getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user.id;

  // Get the metadata to find the file
  const { data: metadata, error: metadataError } = await supabase
    .from("metadata")
    .select("file_id, imageId")
    .eq("id", docId)
    .eq("user_id", userId) // Ensure user owns the book
    .single();

  if (metadataError || !metadata) {
    throw new Error("Book not found or unauthorized");
  }

  // Download the file from storage
  const { data: fileData, error: fileError } = await supabase.storage
    .from(FILE_NAME)
    .download(metadata.file_id);

  if (fileError) {
    throw new Error(`Failed to download book: ${fileError.message}`);
  }

  // store in indexdb
  await db.files.add({
    fileId: metadata.file_id,
    file: fileData,
  });

  //download image form storage
  if (!metadata.imageId) {
    const { data: imageData, error: imageError } = await supabase.storage
      .from(IMAGE_NAME)
      .download(metadata.imageId);

    if (imageError) {
      throw new Error(`Failed to download book: ${imageError.message}`);
    }
  }
  // store in indexdb
  await db.image.add({
    imageId: metadata.imageId,
    image: fileData,
  });
}

async function deleteBook(docId: string) {
  //  TODO: how to authenticate locally

  // const {
  //   data: { user },
  //   error: userError,
  // } = await supabase.auth.getUser();
  // if (userError || !user) {
  //   throw new Error("User not authenticated");
  // }

  const book = await db.metadata.where("docId").equals(docId).first();

  if (!book) {
    throw new Error("Book not found");
  }

  // Delete locally
  await db.files.where("fileId").equals(book.fileId).delete();
  await db.metadata.where("docId").equals(docId).delete();

  await syncManager.queueOperation("delete", docId, {});
}

async function updateBookMetadata(
  docId: string,
  updates: {
    title?: string;
    author?: string;
    tags?: string[];
    is_favourite?: boolean;
    note?: string;
    image?: string;
  },
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  // Also update local storage first
  await db.metadata.where("docId").equals(docId).modify(updates);

  // Queue the update operation for cloud sync
  await syncManager.queueOperation("update", docId, {
    ...updates,
  });

  return { id: docId, ...updates };
}

async function deleteLocalBook(docId: string) {
  try {
    // Get the book metadata first to find fileId and imageId
    const book = await db.metadata.where("docId").equals(docId).first();

    if (!book) {
      throw new Error("Book not found");
    }

    // Delete file from Dexie using fileId
    await db.files.where("fileId").equals(book.fileId).delete();

    // Delete metadata using docId (unique identifier)
    await db.metadata.where("docId").equals(docId).delete();

    // Delete image if it exists
    if (book.imageId) {
      await db.image.where("imageId").equals(book.imageId).delete();
    }
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
