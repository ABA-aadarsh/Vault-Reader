import { describe, it, expect } from "vitest";
import { attemptAutoMerge } from "@/features/sync/policy";
import type { BookEntry } from "@/lib/dexie/types";

function makeBook(overrides: Partial<BookEntry> = {}): BookEntry {
  return {
    id: "b1",
    title: "Title",
    author: "Author",
    tags: ["a"],
    isFavourite: false,
    fileId: "f1",
    imageId: "i1",
    syncScope: "cloud",
    revision: 2,
    baseRevision: 1,
    deletedAt: null,
    fileSyncStatus: "present",
    coverSyncStatus: "present",
    syncStatus: "synced",
    updatedAt: Date.now(),
    updatedByDeviceId: "",
    baseSnapshot: {
      title: "Title",
      author: "Author",
      tags: ["a"],
      isFavourite: false,
    },
    ...overrides,
  };
}

describe("policy — attemptAutoMerge", () => {
  it("returns null merged + clashingFields when title changed by both", () => {
    const local = makeBook({ title: "Local" });
    const remote = makeBook({ title: "Remote", revision: 3 });

    const result = attemptAutoMerge(local, remote, { title: "Local" });
    expect(result.merged).toBeNull();
    expect(result.clashingFields).toContain("title");
  });

  it("returns null merged + clashingFields when author changed by both", () => {
    const local = makeBook({ author: "Local Author" });
    const remote = makeBook({ author: "Remote Author", revision: 3 });

    const result = attemptAutoMerge(local, remote, { author: "Local Author" });
    expect(result.merged).toBeNull();
    expect(result.clashingFields).toContain("author");
  });

  it("auto-merges non-overlapping field changes", () => {
    const local = makeBook({ title: "New Title" });
    const remote = makeBook({ author: "New Author", revision: 3 });

    const result = attemptAutoMerge(local, remote, { title: "New Title" });
    expect(result.merged).not.toBeNull();
    expect(result.merged!.title).toBe("New Title");
    expect(result.merged!.author).toBe("New Author");
    expect(result.clashingFields).toEqual([]);
  });

  it("tags auto-union when both changed", () => {
    const local = makeBook({ tags: ["a", "b"] });
    const remote = makeBook({ tags: ["b", "c"], revision: 3 });

    const result = attemptAutoMerge(local, remote, { tags: ["a", "b"] });
    expect(result.merged).not.toBeNull();
    expect(result.merged!.tags).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(result.clashingFields).toEqual([]);
  });

  it("isFavourite: remote wins (LWW by higher revision)", () => {
    const local = makeBook({ isFavourite: false });
    const remote = makeBook({ isFavourite: true, revision: 3 });

    const result = attemptAutoMerge(local, remote, { isFavourite: false });
    expect(result.merged).not.toBeNull();
    expect(result.merged!.isFavourite).toBe(true);
    expect(result.clashingFields).toEqual([]);
  });

  it("cloud-only change (no local edit) applies remote value", () => {
    const remote = makeBook({ title: "Remote Title", revision: 3 });
    const local = makeBook();

    const result = attemptAutoMerge(local, remote, {});
    expect(result.merged).not.toBeNull();
    expect(result.merged!.title).toBe("Remote Title");
    expect(result.clashingFields).toEqual([]);
  });

  it("no change at all returns local unchanged", () => {
    const local = makeBook();
    const remote = makeBook({ revision: 2 });

    const result = attemptAutoMerge(local, remote, {});
    expect(result.merged).not.toBeNull();
    expect(result.merged!.title).toBe("Title");
    expect(result.clashingFields).toEqual([]);
  });

  it("local-only change (no cloud divergence) returns local unchanged", () => {
    const local = makeBook({ title: "Edited Locally" });
    const remote = makeBook({ revision: 2 });

    const result = attemptAutoMerge(local, remote, { title: "Edited Locally" });
    expect(result.merged).not.toBeNull();
    expect(result.merged!.title).toBe("Edited Locally");
    expect(result.clashingFields).toEqual([]);
  });

  it("both title and author clash returns both fields", () => {
    const local = makeBook({ title: "L", author: "A" });
    const remote = makeBook({ title: "R", author: "B", revision: 3 });

    const result = attemptAutoMerge(local, remote, { title: "L", author: "A" });
    expect(result.merged).toBeNull();
    expect(result.clashingFields).toEqual(
      expect.arrayContaining(["title", "author"]),
    );
  });

  it("tags union works when only cloud changed (no local edit)", () => {
    const remote = makeBook({ tags: ["x", "y"], revision: 3 });
    const local = makeBook();

    const result = attemptAutoMerge(local, remote, {});
    expect(result.merged).not.toBeNull();
    expect(result.merged!.tags).toEqual(expect.arrayContaining(["x", "y"]));
  });
});

describe("policy — progress max merge (readingState)", () => {
  it("max(page) never regresses", () => {
    const localPage = 10;
    const cloudPage = 5;
    expect(Math.max(localPage, cloudPage)).toBe(10);
  });

  it("max(percent) takes cloud when ahead", () => {
    const localPercent = 20;
    const cloudPercent = 80;
    expect(Math.max(localPercent, cloudPercent)).toBe(80);
  });

  it("max merge: local ahead, no conflict, re-enqueue", () => {
    const localPage = 50;
    const cloudPage = 30;
    const mergedPage = Math.max(localPage, cloudPage);
    expect(mergedPage).toBe(50);
    expect(mergedPage > cloudPage).toBe(true);
  });

  it("max merge: equal values, no re-enqueue", () => {
    const localPage = 30;
    const cloudPage = 30;
    const mergedPage = Math.max(localPage, cloudPage);
    expect(mergedPage).toBe(30);
    expect(mergedPage > cloudPage).toBe(false);
  });
});