import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BookVaultDexie } from "@/data/dexie/schema";
import { enqueue, getPendingCount } from "@/features/Sync/data/outbox";

let db: BookVaultDexie;

beforeEach(async () => {
  db = new BookVaultDexie("test-outbox");
  await db.open();
  await db.outbox.clear();
  await db.books.clear();
  await db.notes.clear();
  await db.readingState.clear();
  await db.files.clear();
  await db.images.clear();
  await db.conflicts.clear();
  await db.syncState.clear();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("outbox coalesce", () => {
  it("inserts a fresh entry when none exists", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A" },
      baseRevision: 1,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(1);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry).toBeDefined();
    expect(entry!.op).toBe("upsert");
    expect(entry!.payload).toEqual({ title: "A" });
    expect(entry!.baseRevision).toBe(1);
  });

  it("upsert+upsert merges payload shallowly and keeps earliest baseRevision", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A", author: "X" },
      baseRevision: 3,
    });

    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "B" },
      baseRevision: 2,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(1);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.payload).toEqual({ title: "B", author: "X" });
    expect(entry!.baseRevision).toBe(2);
  });

  it("delete wins over upsert", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A" },
      baseRevision: 1,
    });

    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "delete",
      payload: {},
      baseRevision: 2,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(1);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.op).toBe("delete");
    expect(entry!.payload).toEqual({});
    expect(entry!.baseRevision).toBe(2);
  });

  it("upsert after delete throws (must use restoreBook)", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "delete",
      payload: {},
      baseRevision: 1,
    });

    await expect(
      enqueue(db, {
        entityType: "book",
        entityId: "b1",
        op: "upsert",
        payload: { title: "A" },
        baseRevision: 2,
      }),
    ).rejects.toThrow("pending delete exists");
  });

  it("promote always inserts fresh (no coalesce)", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A" },
      baseRevision: 1,
    });

    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "promote",
      payload: { title: "B", author: "Y" },
      baseRevision: 0,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(2);

    const entries = await db.outbox.where("entityId").equals("b1").toArray();
    const ops = entries.map((e) => e.op).sort();
    expect(ops).toEqual(["promote", "upsert"]);
  });

  it("delete+delete is a no-op (keeps single delete entry)", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "delete",
      payload: {},
      baseRevision: 1,
    });

    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "delete",
      payload: {},
      baseRevision: 2,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(1);

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.op).toBe("delete");
  });

  it("different entityTypes don't coalesce", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A" },
      baseRevision: 1,
    });

    await enqueue(db, {
      entityType: "note",
      entityId: "b1",
      op: "upsert",
      payload: { body: "note text" },
      baseRevision: 1,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(2);
  });

  it("different entityIds don't coalesce", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A" },
      baseRevision: 1,
    });

    await enqueue(db, {
      entityType: "book",
      entityId: "b2",
      op: "upsert",
      payload: { title: "B" },
      baseRevision: 1,
    });

    const count = await getPendingCount(db);
    expect(count).toBe(2);
  });

  it("upsert+upsert payload merge keeps existing keys not in new payload", async () => {
    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "A", author: "X", tags: ["a"] },
      baseRevision: 1,
    });

    await enqueue(db, {
      entityType: "book",
      entityId: "b1",
      op: "upsert",
      payload: { title: "B" },
      baseRevision: 1,
    });

    const entry = await db.outbox.where("entityId").equals("b1").first();
    expect(entry!.payload).toEqual({ title: "B", author: "X", tags: ["a"] });
  });
});
