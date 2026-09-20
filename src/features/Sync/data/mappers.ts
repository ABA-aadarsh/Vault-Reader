// ── Cloud → Local snapshots (snake_case → camelCase) ─────────

export function cloudBookToSnapshot(cloud: Record<string, unknown>): Record<string, unknown> {
  return {
    id: cloud.id,
    title: cloud.title,
    author: cloud.author,
    tags: cloud.tags,
    isFavourite: Boolean(cloud.is_favourite),
    fileId: cloud.file_id,
    imageId: cloud.image_id,
    revision: cloud.revision,
    deletedAt: cloud.deleted_at ? Date.parse(cloud.deleted_at as string) : null,
    updatedAt: cloud.updated_at ? Date.parse(cloud.updated_at as string) : null,
  };
}

export function cloudNoteToSnapshot(cloud: Record<string, unknown>): Record<string, unknown> {
  return {
    bookId: cloud.book_id,
    body: cloud.body,
    revision: cloud.revision,
    deletedAt: cloud.deleted_at ? Date.parse(cloud.deleted_at as string) : null,
    updatedAt: cloud.updated_at ? Date.parse(cloud.updated_at as string) : null,
  };
}