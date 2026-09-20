import { supabase } from "@/lib/supabase";

export async function rpcUpsertBook(
  bookId: string,
  userId: string,
  baseRevision: number,
  payload: Record<string, unknown>,
): Promise<{ revision: number }> {
  const { data, error } = await supabase.rpc("cas_upsert_book", {
    p_id: bookId,
    p_user_id: userId,
    p_base_revision: baseRevision,
    p_title: payload.title ?? "",
    p_author: payload.author ?? "",
    p_tags: payload.tags ?? [],
    p_is_favourite: payload.isFavourite ?? false,
    p_file_id: payload.fileId ?? null,
    p_image_id: payload.imageId ?? null,
  });

  if (error) throw new Error(error.message);
  return { revision: data.revision };
}

export async function rpcUpsertNote(
  bookId: string,
  userId: string,
  baseRevision: number,
  body: string,
): Promise<{ revision: number }> {
  const { data, error } = await supabase.rpc("cas_upsert_note", {
    p_book_id: bookId,
    p_user_id: userId,
    p_base_revision: baseRevision,
    p_body: body,
  });

  if (error) throw new Error(error.message);
  return { revision: data.revision };
}

export async function rpcUpsertReadingState(
  bookId: string,
  userId: string,
  baseRevision: number,
  page: number,
  percent: number,
): Promise<{ revision: number }> {
  const { data, error } = await supabase.rpc("cas_upsert_reading_state", {
    p_book_id: bookId,
    p_user_id: userId,
    p_base_revision: baseRevision,
    p_page: page,
    p_percent: percent,
  });

  if (error) throw new Error(error.message);
  return { revision: data.revision };
}

export async function softDeleteBook(
  bookId: string,
  userId: string,
  currentRevision: number,
): Promise<{ revision: number }> {
  const newRevision = currentRevision + 1;
  const { data, error } = await supabase
    .from("books")
    .update({
      deleted_at: new Date().toISOString(),
      revision: newRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookId)
    .eq("user_id", userId)
    .eq("revision", currentRevision)
    .select("revision")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("CAS conflict: delete revision mismatch");
  return { revision: data.revision };
}

export async function softDeleteNote(
  bookId: string,
  userId: string,
  currentRevision: number,
): Promise<{ revision: number }> {
  const newRevision = currentRevision + 1;
  const { data, error } = await supabase
    .from("notes")
    .update({
      deleted_at: new Date().toISOString(),
      revision: newRevision,
      updated_at: new Date().toISOString(),
    })
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .eq("revision", currentRevision)
    .select("revision")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("CAS conflict: delete revision mismatch");
  return { revision: data.revision };
}