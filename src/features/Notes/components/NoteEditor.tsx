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
  usePublisher,
  type JsxEditorProps,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Check,
  X,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useDb } from "@/data/dexie";
import { deleteNote, upsertNote } from "../data/notes";
import { invalidateNote, useNote } from "../hooks/useNote";
import "@mdxeditor/editor/style.css";

const AUTOSAVE_DEBOUNCE_MS = 1000;

function PageButton({ page }: { page: string }) {
  const handleClick = () => {
    const pageNum = Number.parseInt(String(page), 10);
    if (Number.isNaN(pageNum) || pageNum <= 0) return;
    window.dispatchEvent(
      new CustomEvent("jump-to-page", { detail: { page: pageNum } })
    );
  };
  return (
    <button
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary bg-accent/50 border border-border rounded-md hover:bg-accent hover:border-primary/50 transition-colors duration-150 cursor-pointer"
      onClick={handleClick}
    >
      <FileText className="w-3 h-3" />
      Page {page}
    </button>
  );
}

// Enhanced JSX Editor wrapper component with correct prop handling
function PageButtonEditor({ mdastNode }: JsxEditorProps) {
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

  return <PageButton page={String(page)} />;
}

// Fixed inline toolbar button component for inserting page buttons
function InsertPageButton() {
  const insertJsx = usePublisher(insertJsx$);
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [pageNumber, setPageNumber] = useState("");

  const handleInsert = () => {
    if (pageNumber.trim()) {
      const jsxPayload = {
        name: "PageButton",
        kind: "text" as const,
        props: {
          page: pageNumber.trim(),
        },
        // Add additional properties that might help with prop passing
        attributes: {
          page: pageNumber.trim(),
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
          value={pageNumber}
          onChange={(e) => setPageNumber(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-20 h-6 px-2 py-0 text-xs border-0 bg-transparent focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          autoFocus
        />
        <button
          onClick={handleInsert}
          disabled={!pageNumber.trim()}
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
      title="Insert page reference"
      onClick={() => setIsInputVisible(true)}
    >
      <FileText className="w-4 h-4" />
    </ButtonWithTooltip>
  );
}

function SaveStatusLabel({
  saveState,
  syncStatus,
}: {
  saveState: "idle" | "dirty" | "saving" | "error";
  syncStatus?: "synced" | "pending" | "conflict" | "failed";
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
  return <>Saved</>;
}

export const NoteEditor = ({ bookId }: { bookId: string }) => {
  const db = useDb();
  const editorRef = useRef<MDXEditorMethods>(null);
  const { data: note } = useNote(bookId);

  const [open, setOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "error"
  >("idle");

  // Latest editor content, and the last body persisted to the DB.
  const latestMdRef = useRef("");
  const persistedMdRef = useRef("");
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  const conflicted = note?.syncStatus === "conflict";

  // Apply the DB note to the editor when it is not dirty.
  useEffect(() => {
    if (!editorRef.current) return;
    if (dirtyRef.current) return;
    const body = note?.body ?? "";
    if (body === persistedMdRef.current && body === latestMdRef.current) return;
    editorRef.current.setMarkdown(body);
    latestMdRef.current = body;
    persistedMdRef.current = body;
    dirtyRef.current = false;
    setSaveState("idle");
  }, [note]);

  const persist = useCallback(async () => {
    if (savePromiseRef.current) return;
    savePromiseRef.current = (async () => {
      while (true) {
        const md = latestMdRef.current;
        if (md === persistedMdRef.current) break;
        setSaveState("saving");
        try {
          await upsertNote(db, bookId, md);
          persistedMdRef.current = md;
          if (latestMdRef.current === md) {
            dirtyRef.current = false;
            setSaveState("idle");
          }
          await invalidateNote(bookId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          toast.error(`Failed to save note: ${message}`);
          dirtyRef.current = false;
          setSaveState("error");
          break;
        }
      }
    })().finally(() => {
      savePromiseRef.current = null;
    });
  }, [db, bookId]);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    persist();
  }, [persist]);

  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      latestMdRef.current = markdown;
      dirtyRef.current = true;
      setSaveState("dirty");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush pending edits when leaving the page.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      persist();
    };
  }, [persist]);

  const handleDelete = async () => {
    try {
      await deleteNote(db, bookId);
      setConfirmDelete(false);
      toast.success("Note deleted");
      await invalidateNote(bookId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete note: ${message}`);
    }
  };

  const openConflictInbox = () => {
    window.dispatchEvent(new CustomEvent("open-conflict-inbox"));
  };

  if (!open) {
    return (
      <div className="h-screen shrink-0 border-l border-border bg-background flex flex-col items-center pt-4 gap-4 w-10">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Open notes"
          aria-label="Open notes"
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <StickyNote className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <aside className="h-screen w-[420px] shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
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
            />
          </span>
          {!conflicted && note && (
            <button
              type="button"
              onClick={() => setConfirmDelete((v) => !v)}
              title="Delete note"
              aria-label="Delete note"
              className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Collapse notes"
            aria-label="Collapse notes"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
          >
            <ChevronRight className="w-4 h-4" />
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

      {confirmDelete && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-xs flex-1">Delete this note?</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            className="h-7 text-xs cursor-pointer"
          >
            Delete
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmDelete(false)}
            className="h-7 text-xs cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      )}

      <div
        className={`flex-1 overflow-hidden relative ${conflicted ? "pointer-events-none select-none opacity-80" : ""}`}
      >
        <div className="h-full overflow-auto">
          <Editor
            ref={editorRef}
            markdown=""
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
        </div>
      </div>
    </aside>
  );
};

