import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/dexie"; // your Dexie IndexedDB setup
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";
import { Verified } from "lucide-react";
import { COMMON_STATE_CONFIG_EXTENSIONS } from "@mdxeditor/editor";

const FILE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_FILE_NAME!;
const IMAGE_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_IMAGE_NAME!;

async function uploadBook(
  title: string,
  author: string,
  tags: string[],
  isFavourite: boolean,
  image: File | null,
  file: File,
  syncToCloud: boolean
) {
  const docId = uuidv4();
  const fileId = uuidv4();
  const imageId = uuidv4();

  const user = await AuthAPI.getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  const userId = user.id;

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
    });

    if (syncToCloud) {
      const fileExtension = file.name.split(".").pop();
      const fileName = `${fileId}.${fileExtension}`;
      let imageName: string | null = null;

      // Upload file to Supabase Storage
      const { data: fileData, error: fileError } = await supabase.storage
        .from(FILE_NAME)
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });
      if (fileError) {
        throw new Error(`File upload failed: ${fileError.message}`);
      }
      if (image) {
        const imageExtension = image.name.split(".").pop();
        imageName = `${imageId}.${imageExtension}`;

        // Upload file to Supabase Storage
        const { data: imageData, error: imageError } = await supabase.storage
          .from(IMAGE_NAME)
          .upload(imageName, image, {
            cacheControl: "3600",
            upsert: false,
          });
        if (imageError) {
          throw new Error(`image upload failed: ${imageError.message}`);
        }
      }

      // Create metadata record in Supabase
      const { data: metadataData, error: metadataError } = await supabase
        .from("metadata")
        .insert({
          id: docId,
          title,
          author,
          tags,
          file_id: fileId,
          user_id: userId,
          isFavourite,
          imageId,
          Verified: true,
        })
        .select()
        .single();

      if (metadataError) {
        // If metadata creation fails, clean up the uploaded file
        await supabase.storage.from(FILE_NAME).remove([fileName]);
        if (imageName) {
          await supabase.storage.from(IMAGE_NAME).remove([imageName]);
        }
        throw new Error(`Metadata creation failed: ${metadataError.message}`);
      }

      // Create permissions record in Supabase
      const { data: permissionData, error: permissionError } = await supabase
        .from("permissions")
        .insert({
          file_id: fileId,
          permissioned_to: [userId], // Array of user IDs who have permission
        })
        .select()
        .single();

      if (permissionError) {
        // If permission creation fails, clean up metadata and file
        await supabase.from("metadata").delete().eq("id", docId);
        await supabase.storage.from(FILE_NAME).remove([fileName]);
        if (imageName) {
          await supabase.storage.from(IMAGE_NAME).remove([imageName]);
        }
        throw new Error(
          `Permission creation failed: ${permissionError.message}`
        );
      }
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
      }`
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
      }`
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
      }`
    );
  }
}

async function deleteBook(docId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  // Get the metadata to find the file
  const { data: metadata, error: metadataError } = await supabase
    .from("metadata")
    .select("file_id, user_id")
    .eq("id", docId)
    .eq("user_id", user.id) // Ensure user owns the book
    .single();

  if (metadataError || !metadata) {
    throw new Error("Book not found or unauthorized");
  }

  try {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(FILE_NAME)
      .remove([`${metadata.file_id}`]);

    // Delete metadata
    const { error: metadataDeleteError } = await supabase
      .from("metadata")
      .delete()
      .eq("id", docId);

    // Delete permissions
    const { error: permissionDeleteError } = await supabase
      .from("permissions")
      .delete()
      .eq("file_id", metadata.file_id);

    if (metadataDeleteError || permissionDeleteError) {
      throw new Error("Failed to delete book records");
    }

    // Also delete from local storage
    await db.files.where("fileId").equals(metadata.file_id).delete();
    await db.metadata.where("docId").equals(docId).delete();
  } catch (error) {
    console.error("Error deleting book:", error);
    throw error;
  }
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
  }
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("metadata")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId)
    .eq("user_id", user.id) // Ensure user owns the book
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update book: ${error.message}`);
  }

  // Also update local storage
  await db.metadata.where("docId").equals(docId).modify(updates);

  return data;
}

const BooksAPI = {
  uploadBook,
  listLocalBooks,
  listCloudBooks,
  getlocalBook,
};

export default BooksAPI;
