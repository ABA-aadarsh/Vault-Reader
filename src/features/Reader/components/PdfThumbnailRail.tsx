"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isCancelledRender, pageInfoFrom } from "../data/pdfPage";
import {
  canvasPixelRatio,
  displayedPageSize,
  normalizeRotation,
  pageInfoFor,
  type PageInfo,
  type Rotation,
} from "../data/viewerMath";

/** Width of a thumbnail, in CSS px. */
const THUMBNAIL_WIDTH = 128;
/** Space taken by the page number under a thumbnail. */
const LABEL_HEIGHT = 18;
/** Gap between two thumbnails. */
const THUMBNAIL_GAP = 12;
/** How many rendered thumbnails to keep, so scrolling back is instant. */
const CACHE_LIMIT = 60;
/** Thumbnail rasters allowed at once, so the real page keeps priority. */
const RENDER_LIMIT = 2;

/**
 * Thumbnail rasters go through one shared queue: a rail scroll must never
 * queue up a dozen pdf.js renders in front of the page the reader is looking at.
 */
interface QueuedRender {
  cancelled: boolean;
  run: () => Promise<void>;
}

let activeRenders = 0;
const pendingRenders: QueuedRender[] = [];

function pumpRenders() {
  while (activeRenders < RENDER_LIMIT && pendingRenders.length > 0) {
    const job = pendingRenders.shift();
    if (!job) break;
    if (job.cancelled) continue;

    activeRenders += 1;
    void job
      .run()
      .catch(() => {
        // Errors are reported by the caller; the queue must keep draining.
      })
      .finally(() => {
        activeRenders -= 1;
        pumpRenders();
      });
  }
}

function enqueueRender(run: () => Promise<void>): () => void {
  const job: QueuedRender = { cancelled: false, run };
  pendingRenders.push(job);
  pumpRenders();
  return () => {
    job.cancelled = true;
  };
}

function cacheGet(
  cache: Map<string, HTMLCanvasElement>,
  key: string,
): HTMLCanvasElement | null {
  const cached = cache.get(key);
  if (!cached) return null;
  // Touch: most recently used stays at the end of the map.
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function cacheSet(
  cache: Map<string, HTMLCanvasElement>,
  key: string,
  canvas: HTMLCanvasElement,
) {
  cache.delete(key);
  cache.set(key, canvas);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

interface ThumbnailSize {
  width: number;
  height: number;
}

function thumbnailSize(info: PageInfo, rotation: Rotation): ThumbnailSize {
  const displayed = displayedPageSize(info, rotation);
  const height =
    displayed.width > 0
      ? Math.round((THUMBNAIL_WIDTH * displayed.height) / displayed.width)
      : THUMBNAIL_WIDTH;

  return { width: THUMBNAIL_WIDTH, height: Math.max(1, height) };
}

interface PdfThumbnailProps {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  width: number;
  height: number;
  /** Rotation applied on top of the page's own rotation, in degrees. */
  userRotation: Rotation;
  active: boolean;
  cache: Map<string, HTMLCanvasElement>;
  onSize: (pageNumber: number, info: PageInfo) => void;
  onSelect: (pageNumber: number) => void;
}

const PdfThumbnail = memo(function PdfThumbnail({
  pdf,
  pageNumber,
  width,
  height,
  userRotation,
  active,
  cache,
  onSize,
  onSelect,
}: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [painted, setPainted] = useState(false);

  const cacheKey = `${pageNumber}@${userRotation}@${Math.round(width)}x${Math.round(height)}`;

  useEffect(() => {
    if (!pdf) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    const paint = (source: HTMLCanvasElement) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width !== source.width) canvas.width = source.width;
      if (canvas.height !== source.height) canvas.height = source.height;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      context.drawImage(source, 0, 0);
      setPainted(true);
    };

    const reportSize = (page: PDFPageProxy) => {
      onSize(pageNumber, pageInfoFrom(page));
    };

    const cached = cacheGet(cache, cacheKey);
    if (cached) {
      paint(cached);
      void pdf
        .getPage(pageNumber)
        .then((page) => {
          if (!cancelled) reportSize(page);
        })
        .catch(() => {
          // The bitmap is already on screen; nothing else to do.
        });

      return () => {
        cancelled = true;
      };
    }

    const cancelQueued = enqueueRender(async () => {
      if (cancelled) return;

      let page: PDFPageProxy;
      try {
        page = await pdf.getPage(pageNumber);
      } catch {
        return;
      }
      if (cancelled) return;

      reportSize(page);

      // pdf.js treats the supplied rotation as absolute, so combine the page's
      // own rotation with the user's — exactly like the main viewer does.
      const rotation = normalizeRotation(page.rotate + userRotation);
      const base = page.getViewport({ scale: 1, rotation });
      if (base.width <= 0) return;

      const pixelRatio = canvasPixelRatio(
        width,
        height,
        window.devicePixelRatio,
      );
      const viewport = page.getViewport({
        scale: (width / base.width) * pixelRatio,
        rotation,
      });

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.max(1, Math.floor(viewport.width));
      offscreen.height = Math.max(1, Math.floor(viewport.height));

      const context = offscreen.getContext("2d", { alpha: false });
      if (!context) return;

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        background: "#ffffff",
      });
      task = renderTask;

      try {
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !isCancelledRender(error)) {
          console.warn(`Could not render thumbnail ${pageNumber}:`, error);
        }
        return;
      }
      if (cancelled) return;

      cacheSet(cache, cacheKey, offscreen);
      paint(offscreen);
    });

    return () => {
      cancelled = true;
      task?.cancel();
      cancelQueued();
    };
  }, [pdf, pageNumber, userRotation, width, height, cacheKey, cache, onSize]);

  return (
    <button
      type="button"
      onClick={() => onSelect(pageNumber)}
      aria-current={active ? "page" : undefined}
      aria-label={`Go to page ${pageNumber}`}
      className={cn(
        "mx-auto flex w-full flex-col items-center gap-1 rounded-md px-2 py-1.5 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-secondary" : "hover:bg-muted/60",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-sm border bg-white shadow-sm",
          active ? "border-primary ring-2 ring-primary/50" : "border-border",
        )}
        style={{ width, height }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn("block h-full w-full", painted ? "opacity-100" : "opacity-0")}
        />
        {!painted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <span
        className={cn(
          "text-[11px] tabular-nums",
          active ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {pageNumber}
      </span>
    </button>
  );
});

export interface PdfThumbnailRailProps {
  /** Loaded document. Thumbnails stay blank until it exists. */
  pdf: PDFDocumentProxy | null;
  /** Rotation applied on top of each page's own rotation. Defaults to none. */
  rotation?: Rotation;
  /** Page the reader is on, 1-based. */
  currentPage: number;
  /** Jump to a page. */
  onSelect: (pageNumber: number) => void;
  /** Hide the collapse control (used inside the mobile sheet). */
  collapsible?: boolean;
  className?: string;
}

/**
 * A page-thumbnail rail that replaces the app sidebar inside the reader.
 *
 * Every page gets a small canvas, rendered lazily and virtualized so a
 * thousand-page document costs the same as a ten-page one. The active page is
 * highlighted and kept in view as the reader scrolls the document.
 */
export function PdfThumbnailRail({
  pdf,
  rotation = 0,
  currentPage,
  onSelect,
  collapsible = true,
  className,
}: PdfThumbnailRailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const [pageSizes, setPageSizes] = useState<Map<number, PageInfo>>(() => new Map());
  const cache = useRef<Map<string, HTMLCanvasElement>>(new Map()).current;

  const handleSize = useCallback((pageNumber: number, info: PageInfo) => {
    if (!Number.isFinite(info.width) || !Number.isFinite(info.height)) return;
    if (info.width <= 0 || info.height <= 0) return;

    setPageSizes((prev) => {
      const existing = prev.get(pageNumber);
      if (
        existing &&
        Math.abs(existing.width - info.width) < 0.5 &&
        Math.abs(existing.height - info.height) < 0.5 &&
        existing.rotate === info.rotate
      ) {
        return prev;
      }

      const next = new Map(prev);
      next.set(pageNumber, info);
      return next;
    });
  }, []);

  const numPages = pdf?.numPages ?? 0;

  const sizeFor = useCallback(
    (index: number) => thumbnailSize(pageInfoFor(pageSizes, index + 1), rotation),
    [pageSizes, rotation],
  );

  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => sizeFor(index).height + LABEL_HEIGHT + THUMBNAIL_GAP,
    overscan: 3,
    getItemKey: (index) => index,
  });

  // Estimates are not part of the virtualizer's memo key, so a new page size
  // has to be pushed in explicitly.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, pageSizes, rotation]);

  // Follow the reader, but only move the rail when the active thumb is off
  // screen — otherwise it would yank the list away from someone browsing it.
  useEffect(() => {
    if (!open || numPages === 0) return;
    if (currentPage < 1 || currentPage > numPages) return;

    const index = currentPage - 1;
    const visible = virtualizer
      .getVirtualItems()
      .some((item) => item.index === index);
    if (!visible) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [currentPage, numPages, open, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const width = open ? "w-[168px]" : "w-10";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card",
        width,
        className,
      )}
      aria-label="Page thumbnails"
    >
      {open ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border px-3 py-2">
            <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pages{numPages > 0 ? ` · ${numPages}` : ""}
            </span>
            {collapsible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => setOpen(false)}
                title="Hide thumbnails"
                aria-label="Hide thumbnails"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2"
          >
            {numPages > 0 ? (
              <div style={{ position: "relative", height: totalSize, width: "100%" }}>
                {virtualItems.map((item) => {
                  const size = sizeFor(item.index);
                  return (
                    <div
                      key={item.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <PdfThumbnail
                        pdf={pdf}
                        pageNumber={item.index + 1}
                        width={size.width}
                        height={size.height}
                        userRotation={rotation}
                        active={item.index + 1 === currentPage}
                        cache={cache}
                        onSize={handleSize}
                        onSelect={onSelect}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center pt-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setOpen(true)}
            title="Show thumbnails"
            aria-label="Show thumbnails"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}
