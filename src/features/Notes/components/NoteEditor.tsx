"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@/components/shared/MDXEditor/ForwardRefMDXEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ButtonWithTooltip,
  CreateLink,
  headingsPlugin,
  InsertImage,
  insertJsx$,
  jsxPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  useLexicalNodeRemove,
  usePublisher,
  type JsxEditorProps,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import {
  FileText,
  Check,
  X,
  Loader2,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/data/dexie";
import { upsertNote } from "../data/notes";
import { invalidateNote, useNote } from "../hooks/useNote";
import "@mdxeditor/editor/style.css";

const AUTOSAVE_DEBOUNCE_MS = 500;

function PageButton({ page, onRemove }: { page: string; onRemove: () => void }) {
  const handleClick = () => {
    const pageNum = Number.parseInt(String(page), 10);
    if (Number.isNaN(pageNum) || pageNum <= 0) return;
    window.dispatchEvent(
      new CustomEvent("jump-to-page", { detail: { page: pageNum } })
    );
  };
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-accent/50 text-xs font-medium text-primary transition-colors duration-150 hover:border-primary/50 hover:bg-accent">
      <button
        type="button"
        onClick={handleClick}
        title={`Jump to page ${page}`}
        className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1"
      >
        <FileText className="w-3 h-3" />
        Page {page}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        title="Remove page link"
        aria-label="Remove page link"
        className="cursor-pointer px-1 py-1 text-muted-foreground hover:text-destructive"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// Enhanced JSX Editor wrapper component with correct prop handling
function PageButtonEditor({ mdastNode }: JsxEditorProps) {
  // Removes exactly this JSX node, so each page link can be deleted on its own.
  const removeNode = useLexicalNodeRemove();

  // Correct prop resolution - attributes is an array of {name, value} objects
  let page = "1"; // default

  const attributes = (mdastNode.attributes ?? []) as Array<{
    name: string;
    value?: string;
  }>;

  if (attributes.length > 0) {
    // Find the attribute with name 'page'
    const pageAttribute = attributes.find((attr) => attr.name === "page");
    if (pageAttribute && pageAttribute.value) {
      page = pageAttribute.value;
    }
  }

  return <PageButton page={String(page)} onRemove={removeNode} />;
}

// Fixed inline toolbar button component for inserting page buttons
function InsertPageButton() {
  const insertJsx = usePublisher(insertJsx$);
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [pageNumber, setPageNumber] = useState("");

  // Only positive whole numbers make a valid page reference.
  const isValidPage = /^\d+$/.test(pageNumber) && Number(pageNumber) > 0;

  const handleInsert = () => {
    if (isValidPage) {
      const jsxPayload = {
        name: "PageButton",
        kind: "text" as const,
        props: {
          page: pageNumber,
        },
        // Add additional properties that might help with prop passing
        attributes: {
          page: pageNumber,
        },
      };

      insertJsx(jsxPayload);

      setPageNumber("");
      setIsInputVisible(false);
    }
  };

  const handleCancel = () => {
    setPageNumber("");
    setIsInputVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInsert();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isInputVisible) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-background border border-border rounded-md">
        <Input
          placeholder="Page number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pageNumber}
          onChange={(e) => setPageNumber(e.target.value.replace(/\D/g, ""))}
          onKeyDown={handleKeyDown}
          className="w-20 h-6 px-2 py-0 text-xs border-0 bg-transparent focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          autoFocus
        />
        <button
          onClick={handleInsert}
          disabled={!isValidPage}
          className="h-6 w-6 p-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 rounded flex items-center justify-center"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={handleCancel}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <ButtonWithTooltip
      title="Add link to page"
      onClick={() => setIsInputVisible(true)}
      className="inline-flex items-center"
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <FileText className="w-4 h-4" />
        <span className="text-xs">link to page</span>
      </span>
    </ButtonWithTooltip>
  );
}

function SaveStatusLabel({
  saveState,
  syncStatus,
  hasContent,
}: {
  saveState: "idle" | "dirty" | "saving" | "error";
  syncStatus?: "synced" | "pending" | "conflict" | "failed";
  hasContent: boolean;
}) {
  if (saveState === "saving") return <>Saving…</>;
  if (saveState === "dirty") return <>Unsaved changes</>;
  if (saveState === "error")
    return <span className="text-destructive">Save failed</span>;
  if (syncStatus === "pending") return <>Waiting to sync</>;
  if (syncStatus === "failed")
    return <span className="text-destructive">Sync failed</span>;
  if (syncStatus === "conflict")
    return <span className="text-destructive">Conflict</span>;
  // "Saved" must mean "a write actually happened", not "nothing is pending".
  if (!hasContent) return null;
  return <>Saved</>;
}

export const NoteEditor = ({
  bookId,
  open,
  onClose,
}: {
  bookId: string;
  open: boolean;
  onClose: () => void;
}) => {
  const db = useDb();
  const { data: note, isPending: isNoteLoading } = useNote(bookId);

  // Holding the instance in state (not just a ref) is what re-runs the sync
  // effect when the dynamically imported editor finally mounts. A remount
  // produces a new instance object, so the effect runs again for that too.
  const [editor, setEditor] = useState<MDXEditorMethods | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "error"
  >("idle");

  // Latest editor content, and the last body persisted to the DB.
  const latestMdRef = useRef("");
  const persistedMdRef = useRef("");
  const seededRef = useRef(false);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  const conflicted = note?.syncStatus === "conflict";

  // Seed the "what the editor already shows / what the DB holds" refs in the
  // same render that lets the editor mount. This must happen before effects:
  // MDXEditor emits an onChange while importing its initial markdown, and an
  // empty `latestMdRef` there would look like a user edit (and autosave).
  if (!isNoteLoading && !seededRef.current) {
    const body = note?.body ?? "";
    seededRef.current = true;
    latestMdRef.current = body;
    persistedMdRef.current = body;
  }

  const attachEditor = useCallback((instance: MDXEditorMethods | null) => {
    setEditor(instance);
  }, []);

  // Apply the DB note to the editor once the editor exists and no unflushed
  // local edits would be clobbered.
  useEffect(() => {
    if (!editor) return;
    if (dirtyRef.current) return;

    const body = note?.body ?? "";
    if (body === persistedMdRef.current && body === latestMdRef.current) return;

    // Update the refs before touching the editor: `setMarkdown` emits
    // onChange (synchronously and again after the re-import), and those echoes
    // must not be mistaken for user edits — otherwise deleting a note would
    // immediately re-create it from the cleared editor.
    latestMdRef.current = body;
    persistedMdRef.current = body;
    dirtyRef.current = false;
    editor.setMarkdown(body);
    setSaveState("idle");
  }, [note, editor]);

  const persist = useCallback(async () => {
    // A running loop keeps draining `dirtyRef`, so a change that arrives
    // while a write is in flight is picked up by that loop instead of being
    // dropped (the old code returned and never retried).
    if (savePromiseRef.current) return savePromiseRef.current;

    const task = (async () => {
      while (dirtyRef.current) {
        const md = latestMdRef.current;
        if (md === persistedMdRef.current) break;

        setSaveState("saving");
        try {
          await upsertNote(db, bookId, md);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          toast.error(`Failed to save note: ${message}`);
          dirtyRef.current = false;
          setSaveState("error");
          return;
        }

        persistedMdRef.current = md;
        if (latestMdRef.current === md) {
          dirtyRef.current = false;
          setSaveState("idle");
        }

        try {
          await invalidateNote(bookId);
        } catch {
          // The note is already written; a failed refetch must not be
          // reported as a failed save.
        }
      }

      dirtyRef.current = false;
      setSaveState((prev) => (prev === "error" ? prev : "idle"));
    })();

    savePromiseRef.current = task;
    try {
      await task;
    } finally {
      savePromiseRef.current = null;
    }
  }, [db, bookId]);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void persist();
  }, [persist]);

  const handleMarkdownChange = useCallback(
    (markdown: string, isInitial: boolean) => {
      // MDXEditor emits once with the parsed initial markdown. Treating that
      // as an edit would autosave (and re-format / re-sync) on every open —
      // with the empty editor this used to wipe the stored note.
      if (isInitial) return;
      // Echo of content we just pushed into the editor (setMarkdown).
      if (markdown === latestMdRef.current) return;

      latestMdRef.current = markdown;
      dirtyRef.current = true;
      setSaveState("dirty");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush pending edits on unmount, when the tab is hidden (minimize / switch
  // away), and on pagehide (refresh / navigation). Without this, the tail of a
  // typing burst could sit in the debounce window and never be written.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // The toolbar owns the open/close transition now. Flush pending edits when
  // the panel closes, just like the old in-editor collapse button did.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open) flush();
    wasOpenRef.current = open;
  }, [open, flush]);

  const openConflictInbox = () => {
    window.dispatchEvent(new CustomEvent("open-conflict-inbox"));
  };

  return (
    <aside
      className={`h-full shrink-0 bg-background flex flex-col overflow-hidden ${
        open ? "w-[420px] border-l border-border" : "w-0"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Notes</h2>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">
            <SaveStatusLabel
              saveState={saveState}
              syncStatus={note?.syncStatus}
              hasContent={Boolean(note?.body)}
            />
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Close notes"
            aria-label="Close notes"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {conflicted && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-destructive/10 border-b border-border">
          <span className="text-xs text-destructive">
            Sync conflict — resolve to edit
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={openConflictInbox}
            className="h-7 text-xs cursor-pointer"
          >
            View conflicts
          </Button>
        </div>
      )}

      {/* The editor stays mounted while collapsed: unmounting it used to
          re-create an empty editor on reopen (and lose the content on
          refresh). Hidden with CSS so its state survives. */}
      <div
        className={`relative flex-1 overflow-hidden ${
          open ? "" : "hidden"
        } ${conflicted ? "pointer-events-none select-none opacity-80" : ""}`}
      >
        <div className="h-full overflow-auto">
          {isNoteLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Editor
              ref={attachEditor}
              markdown={note?.body ?? ""}
              onChange={handleMarkdownChange}
            className="prose prose-sm w-full max-w-full prose-invert dark-theme dark-editor"
            plugins={[
              headingsPlugin(),
              listsPlugin(),
              quotePlugin(),
              thematicBreakPlugin(),
              markdownShortcutPlugin(),
              jsxPlugin({
                jsxComponentDescriptors: [
                  {
                    name: "PageButton",
                    kind: "text",
                    source: "./components/PageButton",
                    props: [
                      {
                        name: "page",
                        type: "string",
                      },
                    ],
                    hasChildren: false,
                    Editor: PageButtonEditor,
                  },
                ],
              }),
              toolbarPlugin({
                toolbarContents: () => (
                  <div className="w-full grid grid-cols-2  gap-y-1 items-center p-2 bg-card text-card-foreground m-0 border-b border-border">
                    <div className="flex items-center">
                      <UndoRedo />
                      <BoldItalicUnderlineToggles />
                    </div>

                    {/* <div className="flex items-center">
                      <BoldItalicUnderlineToggles />
                    </div> */}

                    <div className="flex items-center">
                      <BlockTypeSelect />
                    </div>

                    <div className="flex items-center gap-2">
                      <CreateLink />
                      <InsertImage />
                      <ListsToggle />
                    </div>
                    {/* 
                    <div className="flex items-center">
                      <ListsToggle />
                    </div> */}

                    <div className="flex items-center">
                      <InsertPageButton />
                    </div>
                  </div>
                ),
              }),
            ]}
          />
          )}
        </div>
      </div>
    </aside>
  );
};

