import type { BookEntry } from "@/lib/dexie/types";

export interface AutoMergeResult {
  merged: BookEntry | null;
  clashingFields: string[];
}

const MERGEABLE_FIELDS = ["title", "author", "tags", "isFavourite"] as const;

export function attemptAutoMerge(
  local: BookEntry,
  remote: BookEntry,
  payload: Record<string, unknown>,
): AutoMergeResult {
  const clashingFields: string[] = [];
  const merged = { ...local };
  const base = local.baseSnapshot;

  for (const field of MERGEABLE_FIELDS) {
    const localValue = local[field];
    const remoteValue = remote[field as keyof BookEntry];

    if (remoteValue === undefined) continue;

    // The user edited this field locally if it appears in the outbox payload.
    const userChanged = field in payload;

    // The cloud diverged from our last-synced baseline only if it differs from
    // baseSnapshot (NOT from local, which already contains our pending edits).
    const baseValue = base?.[field];
    const cloudChanged =
      baseValue === undefined
        ? remoteValue !== localValue
        : remoteValue !== baseValue;

    if (userChanged && cloudChanged) {
      if (field === "tags") {
        const localTags = new Set(local.tags);
        const remoteTags = new Set(remote.tags as string[]);
        const union = Array.from(new Set([...localTags, ...remoteTags]));
        merged.tags = union;
      } else if (field === "isFavourite") {
        merged.isFavourite = remote.isFavourite;
      } else {
        clashingFields.push(field);
      }
    } else if (cloudChanged) {
      (merged as Record<string, unknown>)[field] = remoteValue;
    }
    // else: user-only change or no change → merged head already carries local value
  }

  if (clashingFields.length > 0) {
    return { merged: null, clashingFields };
  }

  return { merged, clashingFields: [] };
}
