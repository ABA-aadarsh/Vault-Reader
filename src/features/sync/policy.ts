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

  for (const field of MERGEABLE_FIELDS) {
    const localValue = local[field];
    const remoteValue = remote[field as keyof BookEntry];
    const payloadValue = payload[field];

    if (payloadValue === undefined) continue;

    const localChanged = payloadValue !== localValue;
    const remoteChanged = remoteValue !== localValue;

    if (localChanged && remoteChanged) {
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
    } else if (remoteChanged) {
      (merged as Record<string, unknown>)[field] = remoteValue;
    }
  }

  if (clashingFields.length > 0) {
    return { merged: null, clashingFields };
  }

  return { merged, clashingFields: [] };
}
