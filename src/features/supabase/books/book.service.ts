import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/dexie"; // your Dexie IndexedDB setup
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../index";
import AuthAPI from "../auth/auth.service";

const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME!;

async function uploadBook(
  title: string,
  author: string,
  tags: string[],
  fileUrl: string,
  isFavourite: boolean,
  note: string,
  image: string,
  file: File,
  syncToCloud: boolean
) {
  const docId = uuidv4();
  const fileId = uuidv4();

  const user = await AuthAPI.getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user.id;
  const verified = new Date().toISOString();

  try {
    // Upload file to local IndexedDB
    await db.files.add({
      fileId,
      file,
      createdAt: new Date().toISOString(),
    });

    // Upload metadata to local IndexedDB
    await db.metadata.add({
      docId,
      userId,
      title,
      author,
      tags,
      fileId,
      fileUrl,
      isFavourite,
      verified,
      note,
      image: "", // url or what
    });

    // Upload permissions to local IndexedDB
    await db.permissions.add({
      fileId,
      permissioned_to: [],
    });

    if (syncToCloud) {
      // Upload file to Supabase Storage
      const fileExtension = file.name.split(".").pop();
      const fileName = `${fileId}.${fileExtension}`;

      const { data: fileData, error: fileError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (fileError) {
        throw new Error(`File upload failed: ${fileError.message}`);
      }

      // Get the public URL for the uploaded file
      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

      // Create metadata record in Supabase
      const { data: metadataData, error: metadataError } = await supabase
        .from("metadata")
        .insert({
          id: docId,
          user_id: userId,
          title,
          author,
          tags,
          file_id: fileId,
          file_url: publicUrl, // Use the actual uploaded file URL
          is_favourite: isFavourite,
          verified,
          note,
          image,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (metadataError) {
        // If metadata creation fails, clean up the uploaded file
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);
        throw new Error(`Metadata creation failed: ${metadataError.message}`);
      }

      // Create permissions record in Supabase
      const { data: permissionData, error: permissionError } = await supabase
        .from("permissions")
        .insert({
          file_id: fileId,
          permissioned_to: [userId], // Array of user IDs who have permission
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (permissionError) {
        // If permission creation fails, clean up metadata and file
        await supabase.from("metadata").delete().eq("id", docId);
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);
        throw new Error(
          `Permission creation failed: ${permissionError.message}`
        );
      }

      return {
        docId,
        fileId,
        fileUrl: publicUrl,
        metadata: metadataData,
        permissions: permissionData,
      };
    }

    return {
      docId,
      fileId,
      fileUrl: null, // No cloud URL when not syncing
      metadata: null,
      permissions: null,
    };
  } catch (error) {
    console.error("Error uploading book:", error);
    // Clean up local storage if needed
    try {
      await db.files.where("fileId").equals(fileId).delete();
      await db.metadata.where("docId").equals(docId).delete();
      await db.permissions.where("fileId").equals(fileId).delete();
    } catch (cleanupError) {
      console.error("Error cleaning up local storage:", cleanupError);
    }
    throw error;
  }
}

// Additional helper functions for Supabase operations
async function getBooks(userId?: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  const targetUserId = userId || user.id;

  const { data, error } = await supabase
    .from("metadata")
    .select("*")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch books: ${error.message}`);
  }

  return data;
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
      .from(BUCKET_NAME)
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
    await db.permissions.where("fileId").equals(metadata.file_id).delete();
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
  getBooks,
  deleteBook,
  updateBookMetadata,
};

export default BooksAPI;
