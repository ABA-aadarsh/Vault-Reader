"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { isCancelledRender, pageInfoFrom } from "../data/pdfPage";
import {
  PAGE_GAP,
  canvasPixelRatio,
  type PageInfo,
  type Rotation,
} from "../data/viewerMath";

export interface PdfPageCanvasProps {
  /** Loaded document. Until it exists the page card stays blank. */
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  /** Size the page occupies in the document, in CSS px. */
  width: number;
  height: number;
  /** Size the bitmap is rasterized at, in CSS px (before pixel ratio). */
  renderWidth: number;
  renderHeight: number;
  rotate: Rotation;
  /** Absolute top offset of the row inside the scroll column. */
  top: number;
  onSize: (pageNumber: number, info: PageInfo) => void;
}

/**
 * One page, painted onto a canvas this component owns.
 *
 * Unlike `react-pdf`'s `<Page>` (which keys its canvas on the scale and
 * re-creates it on every re-raster, leaving it blank until pdf.js finishes),
 * the canvas element here is mounted once per page and never remounts on zoom.
 * A new raster is drawn into an offscreen canvas first and copied over in a
 * single synchronous step, so the previous frame stays visible the whole time —
 * zooming only ever changes sharpness, never size or content mid-flight.
 *
 * The canvas is also sized purely with CSS (`100%` of the card), so its aspect
 * ratio always matches the card exactly and can never be stretched.
 */
export const PdfPageCanvas = memo(function PdfPageCanvas({
  pdf,
  pageNumber,
  width,
  height,
  renderWidth,
  renderHeight,
  rotate,
  top,
  onSize,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Rotation the current bitmap was painted for; `null` means "nothing yet".
  const paintedRotationRef = useRef<Rotation | null>(null);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!pdf) return;

    const canvas = canvasRef.current;
    if (!canvas || !Number.isFinite(renderWidth) || renderWidth <= 0) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    // Rotating changes the page's aspect ratio, so the old bitmap would be
    // stretched. Show a blank page instead of a distorted one.
    if (
      paintedRotationRef.current !== null &&
      paintedRotationRef.current !== rotate
    ) {
      paintedRotationRef.current = null;
      canvas.width = 0;
      canvas.height = 0;
      setPainted(false);
    }

    void (async () => {
      let page: PDFPageProxy;
      try {
        page = await pdf.getPage(pageNumber);
      } catch {
        return;
      }
      if (cancelled) return;

      onSize(pageNumber, pageInfoFrom(page));

      const base = page.getViewport({ scale: 1, rotation: rotate });
      if (base.width <= 0) return;

      const pixelRatio = canvasPixelRatio(
        renderWidth,
        renderHeight,
        window.devicePixelRatio,
      );
      const viewport = page.getViewport({
        scale: (renderWidth / base.width) * pixelRatio,
        rotation: rotate,
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
          console.warn(`Could not render page ${pageNumber}:`, error);
        }
        return;
      }
      if (cancelled) return;

      const visible = canvasRef.current;
      if (!visible) return;

      // Resize and copy in one synchronous block: the canvas is never painted
      // in its cleared state.
      if (visible.width !== offscreen.width) visible.width = offscreen.width;
      if (visible.height !== offscreen.height) visible.height = offscreen.height;

      const visibleContext = visible.getContext("2d", { alpha: false });
      if (!visibleContext) return;
      visibleContext.drawImage(offscreen, 0, 0);

      paintedRotationRef.current = rotate;
      setPainted(true);
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, rotate, renderWidth, renderHeight, onSize]);

  return (
    <div
      data-page-number={pageNumber}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: height + PAGE_GAP,
        transform: `translateY(${top}px)`,
      }}
    >
      <div
        className="relative overflow-hidden bg-white shadow-sm"
        style={{ width, height, marginInline: "auto" }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Page ${pageNumber}`}
          className="block h-full w-full"
        />
        {!painted && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
});

PdfPageCanvas.displayName = "PdfPageCanvas";
