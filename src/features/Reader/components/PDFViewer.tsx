"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Document, pdfjs, type DocumentProps } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeft,
  StickyNote,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PDF_WORKER_SRC } from "../data/pdfWorker";
import { PdfPageCanvas } from "./PdfPageCanvas";
import {
  MAX_SCALE,
  MIN_SCALE,
  PAGE_GAP,
  anchoredScrollForZoom,
  buildPageMetrics,
  captureZoomAnchor,
  clampScale,
  computeEffectiveScale,
  displayedPageSize,
  pageIndexAtOffset,
  pageInfoFor,
  roundScale,
  shouldCommitRenderScale,
  zoomAnchorLayout,
  type PageInfo,
  type Rotation,
  type ZoomAnchor,
  type ZoomMode,
} from "../data/viewerMath";

pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

export type PDFDocument = Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0];

interface PDFViewerProps {
  fileUrl: string | null;
  className?: string;
  /** Page to restore on load (e.g. saved reading position). 1-based. */
  initialPage?: number;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  /** Book title shown in the toolbar. */
  title?: string;
  /** Panels rendered beside the document, under the full-width toolbar. */
  leftPanel?: ReactNode;
  rightPanel?: ReactNode;
  /** Rendered as a back button when provided (the reader has no app sidebar). */
  onBack?: () => void;
  /** Opens the thumbnail rail on small screens. */
  onShowThumbnails?: () => void;
  /** Hands the loaded pdf.js document to the caller (used by the thumbnail rail). */
  onDocumentLoad?: (document: PDFDocument, numPages: number) => void;
  /** Whether the notes panel is visible; drives the toolbar toggle. */
  notesOpen?: boolean;
  onToggleNotes?: () => void;
}

export interface PDFViewerHandle {
  jumpToPage: (pageNum: number) => void;
}

const INITIAL_ZOOM_MODE: ZoomMode = "fit-width";
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
/** How long zoom must be quiet before a page is re-rasterized. */
const RENDER_SETTLE_MS = 180;
/** Upper bound on raster width, to keep huge zooms from exhausting memory. */
const MAX_RENDER_WIDTH = 1800;

export const PDFViewer = forwardRef<PDFViewerHandle, PDFViewerProps>(({
  fileUrl,
  className = "",
  initialPage,
  onPageChange,
  leftPanel,
  rightPanel,
  title,
  onBack,
  onShowThumbnails,
  onDocumentLoad,
  notesOpen,
  onToggleNotes,
}, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSizes, setPageSizes] = useState<Map<number, PageInfo>>(() => new Map());
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [rotation, setRotation] = useState<Rotation>(0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(INITIAL_ZOOM_MODE);
  const [customScale, setCustomScale] = useState(1);
  // Scale the visible canvases were last rasterized at. `null` means "no
  // raster yet", so the first paint follows the display scale exactly.
  const [renderScale, setRenderScale] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [restoreDone, setRestoreDone] = useState(!initialPage || initialPage <= 1);

  // The scale currently on screen. Updated synchronously when zooming so
  // consecutive wheel events compose correctly before React commits.
  const scaleRef = useRef(1);
  const restoredForRef = useRef<string | null>(null);
  // Guards async work against a file change (or unmount).
  const loadTokenRef = useRef(0);
  // Content point held under the pointer for the duration of a zoom burst.
  // Applied in a layout effect, in the same frame the new layout commits.
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  // Page to bring back to the top after a layout change that is not a zoom
  // (fit-mode switching, rotation). Applied in a layout effect on `metrics`.
  const pendingScrollPageRef = useRef<number | null>(null);

  // Measure the pane, not the scroll area itself: the scrollbars the viewer
  // creates can then never change the fit scale, which used to cause a
  // reflow/re-render loop (and therefore flashing) while zooming.
  useEffect(() => {
    const pane = paneRef.current;
    const scroller = containerRef.current;
    if (!pane || !scroller) return;

    const measure = () => {
      const width = scroller.clientWidth;
      const height = pane.clientHeight;
      setViewport((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // A new file starts from a clean slate.
  useEffect(() => {
    loadTokenRef.current += 1;
    setPdf(null);
    setNumPages(0);
    setPageSizes(new Map());
    setRotation(0);
    setZoomMode(INITIAL_ZOOM_MODE);
    setCustomScale(1);
    setRenderScale(null);
    setCurrentPage(1);
    setPageInput("1");
    setIsLoading(Boolean(fileUrl));
    setError(null);
  }, [fileUrl]);

  // A new document (or a late-arriving saved position) re-arms the restore.
  useEffect(() => {
    restoredForRef.current = null;
    setRestoreDone(!initialPage || initialPage <= 1);
  }, [fileUrl, initialPage]);

  const handleDocumentLoadSuccess = useCallback((loaded: PDFDocument) => {
    const token = loadTokenRef.current;
    setPdf(loaded);
    setNumPages(loaded.numPages);
    setIsLoading(false);
    setError(null);
    onDocumentLoad?.(loaded, loaded.numPages);

    // Seed every page's estimate from page 1 so the first paint has sane
    // dimensions; each page corrects this once it actually loads.
    void loaded
      .getPage(1)
      .then((firstPage) => {
        if (loadTokenRef.current !== token) return;

        const viewport = firstPage.getViewport({ scale: 1, rotation: 0 });

        setPageSizes((prev) => {
          const next = new Map(prev);
          next.set(1, {
            width: viewport.width || 612,
            height: viewport.height || 792,
            rotate: firstPage.rotate,
          });
          return next;
        });
      })
      .catch(() => {
        // Page 1 dimensions are only a hint; defaults are fine.
      });
  }, [onDocumentLoad]);

  const handleDocumentLoadError = useCallback((loadError: Error) => {
    setError(loadError.message);
    setIsLoading(false);
  }, []);

  const handlePageSize = useCallback((pageNumber: number, info: PageInfo) => {
    const { width, height } = info;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    setPageSizes((prev) => {
      const existing = prev.get(pageNumber);
      if (
        existing &&
        Math.abs(existing.width - width) < 0.5 &&
        Math.abs(existing.height - height) < 0.5 &&
        existing.rotate === info.rotate
      ) {
        return prev;
      }

      const next = new Map(prev);
      next.set(pageNumber, { width, height, rotate: info.rotate });
      return next;
    });
  }, []);

  const effectiveScale = useMemo(
    () =>
      computeEffectiveScale({
        mode: zoomMode,
        customScale,
        sizes: pageSizes,
        numPages,
        userRotation: rotation,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      }),
    [zoomMode, customScale, pageSizes, numPages, rotation, viewport.width, viewport.height],
  );

  const metrics = useMemo(
    () =>
      buildPageMetrics({
        sizes: pageSizes,
        numPages,
        userRotation: rotation,
        scale: effectiveScale,
        viewportWidth: viewport.width,
      }),
    [pageSizes, numPages, rotation, effectiveScale, viewport.width],
  );

  // Scale the canvases were last rasterized at. Until the first commit it
  // follows the display scale, afterwards it only moves when the drift is
  // large enough to matter.
  const committedRenderScale = renderScale ?? effectiveScale;

  // The layout that is actually committed to the DOM. Event handlers read the
  // ref instead of their closure so a wheel tick that lands right after a
  // commit never anchors against the previous, already-replaced layout.
  const metricsRef = useRef(metrics);
  useLayoutEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  // Zoom anchoring happens here rather than in a requestAnimationFrame: by the
  // time layout effects run the new page boxes are already in the DOM, so the
  // scroll correction is applied before the browser paints. Previously the
  // frame callback could win or lose the race against React's commit, which is
  // what made the zoom flash and snap back.
  useLayoutEffect(() => {
    const element = containerRef.current;
    const anchor = zoomAnchorRef.current;
    if (!element || !anchor) return;

    zoomAnchorRef.current = null;

    const next = anchoredScrollForZoom(
      zoomAnchorLayout(metrics, element.clientWidth),
      anchor,
    );

    if (Math.abs(element.scrollLeft - next.scrollLeft) >= 0.5) {
      element.scrollLeft = next.scrollLeft;
    }
    if (Math.abs(element.scrollTop - next.scrollTop) >= 0.5) {
      element.scrollTop = next.scrollTop;
    }
  }, [metrics]);

  // Fit-mode switches and rotation pin the current page to the top instead of
  // following a pointer.
  useLayoutEffect(() => {
    const index = pendingScrollPageRef.current;
    const element = containerRef.current;
    if (index === null || !element) return;

    pendingScrollPageRef.current = null;
    const offset = metrics.offsets[index];
    if (offset === undefined) return;
    element.scrollTop = offset;
  }, [metrics]);

  // If the layout did not actually change (e.g. switching fit modes when the
  // scale is identical) the pending request must not linger and hijack a later
  // re-layout when a page reports its size.
  useEffect(() => {
    pendingScrollPageRef.current = null;
  }, [metrics, zoomMode, rotation]);

  // Re-rasterize only once zooming has settled, and only when the existing
  // raster has drifted far enough to look soft. The very first scale after a
  // load is committed immediately.
  useEffect(() => {
    if (viewport.width <= 0) return;

    if (renderScale === null) {
      setRenderScale(roundScale(effectiveScale));
      return;
    }

    if (!shouldCommitRenderScale(renderScale, effectiveScale)) return;

    const timer = setTimeout(() => {
      setRenderScale(roundScale(effectiveScale));
    }, RENDER_SETTLE_MS);

    return () => clearTimeout(timer);
  }, [renderScale, effectiveScale, viewport.width]);

  useLayoutEffect(() => {
    scaleRef.current = effectiveScale;
  }, [effectiveScale]);

  const rowVirtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (metrics.heights[index] ?? metrics.heights[0] ?? 0) + PAGE_GAP,
    overscan: 2,
    // Stable keys: zooming must never remount/recreate page canvases.
    getItemKey: (index) => index,
  });

  // Page boxes changed (zoom, rotation, a newly measured page): let the
  // virtualizer recalculate with the exact sizes instead of stale estimates.
  useLayoutEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, metrics]);

  const goToPage = useCallback(
    (pageNumber: number) => {
      if (numPages === 0 || !Number.isFinite(pageNumber)) return;

      const target = Math.min(Math.max(Math.round(pageNumber), 1), numPages);
      rowVirtualizer.scrollToIndex(target - 1, { align: "start" });
      setCurrentPage(target);
    },
    [numPages, rowVirtualizer],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpToPage: goToPage,
    }),
    [goToPage],
  );

  // Restore the saved position once the document knows its page count.
  // The "already restored" guard is set inside the frame (not before it) so a
  // frame cancelled by a re-render re-schedules instead of disabling progress
  // persistence forever.
  useEffect(() => {
    if (!initialPage || initialPage <= 1 || numPages === 0 || !fileUrl) return;
    if (restoredForRef.current === fileUrl) return;

    const index = Math.min(Math.max(initialPage, 1), numPages) - 1;
    const raf = requestAnimationFrame(() => {
      if (restoredForRef.current === fileUrl) return;
      restoredForRef.current = fileUrl;
      rowVirtualizer.scrollToIndex(index, { align: "start" });
      setCurrentPage(index + 1);
      setRestoreDone(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [initialPage, numPages, fileUrl, rowVirtualizer]);

  // Track the page occupying the top quarter of the viewport.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleScroll = () => {
      if (metrics.offsets.length === 0) return;

      const probe = element.scrollTop + element.clientHeight * 0.25;
      const index = pageIndexAtOffset(metrics.offsets, probe);
      setCurrentPage((prev) => (prev === index + 1 ? prev : index + 1));
    };

    handleScroll();
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [metrics.offsets]);

  // Report page changes upwards (used to persist reading progress).
  // Suppressed until any saved-position restore has landed.
  useEffect(() => {
    if (!onPageChange || numPages === 0 || !restoreDone) return;
    onPageChange(currentPage, numPages);
  }, [currentPage, numPages, onPageChange, restoreDone]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const applyZoom = useCallback(
    (nextScale: number, anchor?: { x: number; y: number }) => {
      const clamped = clampScale(nextScale);
      const previous = scaleRef.current;

      if (Math.abs(clamped - previous) < 0.001) return;

      // Set the ref up front so a burst of wheel events composes correctly.
      scaleRef.current = clamped;

      const element = containerRef.current;
      if (element && anchor) {
        // Capture once per burst, from the layout that is actually on screen;
        // later ticks only move the pointer. Page-relative fractions keep the
        // anchor exact across the re-layout, including the fixed page gaps and
        // the horizontal centring the old content-coordinate math ignored.
        const pending = zoomAnchorRef.current;
        zoomAnchorRef.current = pending
          ? { ...pending, pointerX: anchor.x, pointerY: anchor.y }
          : captureZoomAnchor(
              zoomAnchorLayout(metricsRef.current, element.clientWidth),
              element.scrollLeft,
              element.scrollTop,
              anchor.x,
              anchor.y,
            );
      }

      setZoomMode("custom");
      setCustomScale(clamped);
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const element = containerRef.current;
      const anchor = element
        ? { x: element.clientWidth / 2, y: element.clientHeight / 2 }
        : undefined;
      applyZoom(scaleRef.current * factor, anchor);
    },
    [applyZoom],
  );

  const resetZoom = useCallback(() => {
    const element = containerRef.current;
    const anchor = element
      ? { x: element.clientWidth / 2, y: element.clientHeight / 2 }
      : undefined;
    applyZoom(1, anchor);
  }, [applyZoom]);

  const setFitMode = useCallback(
    (mode: ZoomMode) => {
      if (zoomMode === mode) return;

      // Keep the reader on the same page while the document reflows. The
      // correction is applied in the layout effect next to the metrics.
      pendingScrollPageRef.current = Math.max(currentPage - 1, 0);
      setZoomMode(mode);
    },
    [currentPage, zoomMode],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      const element = containerRef.current;
      if (!element) return;

      event.preventDefault();

      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      applyZoom(scaleRef.current * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [applyZoom],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void rootRef.current?.requestFullscreen?.();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const commitPageInput = useCallback(() => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  }, [currentPage, goToPage, pageInput]);

  if (error) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-background text-foreground ${className}`}>
        <div className="p-8 text-center">
          <FileText className="mx-auto mb-4 h-16 w-16 text-red-400" />
          <h3 className="mb-2 text-lg font-medium">Failed to load PDF</h3>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const zoomPercent = Math.round(effectiveScale * 100);
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={rootRef}
      className={`relative flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden bg-secondary text-foreground ${className}`}
    >
      {/* The toolbar spans the whole panel; everything else lives below it. */}
      <div className="shrink-0 border-b border-border bg-card shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2">
          {/* Identity (left) */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                title="Back to library"
                aria-label="Back to library"
                className="gap-1 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Back to library</span>
              </Button>
            )}

            {onBack && title && (
              <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
            )}

            {title && (
              <span
                className="hidden max-w-[32ch] truncate text-base font-semibold text-foreground sm:inline"
                title={title}
              >
                {title}
              </span>
            )}

            {onShowThumbnails && (
              <Button
                onClick={onShowThumbnails}
                variant="ghost"
                size="icon"
                className="md:hidden"
                title="Page thumbnails"
                aria-label="Page thumbnails"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Zoom (center) */}
          <div className="flex items-center gap-1">
            <Button
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={effectiveScale <= MIN_SCALE}
              variant="ghost"
              size="icon"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Button
              onClick={resetZoom}
              variant="outline"
              size="sm"
              title="Reset zoom to 100%"
              className="w-16 tabular-nums"
            >
              {zoomPercent}%
            </Button>

            <Button
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={effectiveScale >= MAX_SCALE}
              variant="ghost"
              size="icon"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Page navigation + view tools (right) */}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
            {numPages > 0 && (
              <div className="flex items-center gap-0.5">
                <Button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  variant="ghost"
                  size="icon"
                  title="Previous page"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-1 text-xs tabular-nums">
                  <input
                    type="number"
                    min="1"
                    max={numPages}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    onBlur={commitPageInput}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Page number"
                    className="w-10 rounded border border-input bg-background px-1 py-1 text-center text-xs tabular-nums [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="whitespace-nowrap text-muted-foreground">/ {numPages}</span>
                </div>

                <Button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                  variant="ghost"
                  size="icon"
                  title="Next page"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <Button
              onClick={() => setFitMode("fit-width")}
              variant={zoomMode === "fit-width" ? "secondary" : "outline"}
              size="sm"
              title="Fit page width"
            >
              Fit width
            </Button>

            <Button
              onClick={() => setFitMode("fit-page")}
              variant={zoomMode === "fit-page" ? "secondary" : "outline"}
              size="sm"
              title="Fit whole page"
            >
              Fit page
            </Button>

            <div className="mx-1 h-4 w-px bg-border" />

            <Button
              onClick={onToggleNotes}
              variant={notesOpen ? "secondary" : "ghost"}
              size="icon"
              title={notesOpen ? "Hide notes" : "Show notes"}
              aria-label={notesOpen ? "Hide notes" : "Show notes"}
              aria-pressed={notesOpen}
            >
              <StickyNote className="h-4 w-4" />
            </Button>

            <Button
              onClick={toggleFullscreen}
              variant="ghost"
              size="icon"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            <a
              href={fileUrl ?? undefined}
              download
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              title="Download PDF"
              aria-label="Download PDF"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {leftPanel}

        {/* Scroll area stays mounted while loading so it can be measured. */}
        <div ref={paneRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            ref={containerRef}
            className="absolute inset-0 overflow-auto overscroll-contain bg-background"
          >
            {fileUrl && (
              <Document
                file={fileUrl}
                onLoadSuccess={handleDocumentLoadSuccess}
                onLoadError={handleDocumentLoadError}
                onSourceError={handleDocumentLoadError}
                loading={null}
                error={null}
                noData={null}
              >
                {numPages > 0 && pdf && (
                  <div
                    style={{
                      position: "relative",
                      width: metrics.contentWidth,
                      height: metrics.totalSize,
                      margin: "0 auto",
                    }}
                  >
                    {virtualItems.map((virtualRow) => {
                      const index = virtualRow.index;
                      const width = metrics.widths[index];
                      const height = metrics.heights[index];

                      if (!width || !height) return null;

                      // Raster dimensions come from the page's intrinsic size
                      // and the committed render scale, not from the display
                      // metrics — otherwise float noise during a wheel burst
                      // would change the raster and force a re-render mid-zoom.
                      const displayed = displayedPageSize(
                        pageInfoFor(pageSizes, index + 1),
                        rotation,
                      );
                      const rasterScale = Math.min(
                        committedRenderScale,
                        MAX_RENDER_WIDTH / Math.max(displayed.width, 1),
                      );
                      const rasterWidth = Math.max(1, Math.round(displayed.width * rasterScale));
                      const rasterHeight = Math.max(
                        1,
                        Math.round(displayed.height * rasterScale),
                      );

                      return (
                        <PdfPageCanvas
                          key={virtualRow.key}
                          pdf={pdf}
                          pageNumber={index + 1}
                          width={width}
                          height={height}
                          renderWidth={rasterWidth}
                          renderHeight={rasterHeight}
                          rotate={metrics.rotations[index] ?? rotation}
                          // Position from the layout math rather than the
                          // virtualizer's cached measurements: those only refresh
                          // one render after a zoom, which would leave pages a
                          // frame behind the layout-effect scroll correction.
                          top={metrics.offsets[index] ?? virtualRow.start}
                          onSize={handlePageSize}
                        />
                      );
                    })}
                  </div>
                )}
              </Document>
            )}
          </div>

          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading PDF…</p>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-4 right-4 hidden rounded bg-black/75 px-3 py-2 text-xs text-white lg:block">
            Ctrl + Wheel: Zoom
          </div>
        </div>

        {rightPanel}
      </div>
    </div>
  );
});

PDFViewer.displayName = "PDFViewer";
