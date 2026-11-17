import type { PDFPageProxy } from "pdfjs-dist";
import type { PageInfo } from "./viewerMath";

/** Intrinsic page geometry, before any user rotation is applied. */
export function pageInfoFrom(page: PDFPageProxy): PageInfo {
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  return {
    width: viewport.width,
    height: viewport.height,
    rotate: page.rotate,
  };
}

/** pdf.js throws this when a `RenderTask` is cancelled; it is not an error. */
export function isCancelledRender(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "RenderingCancelledException"
  );
}
