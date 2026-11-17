/**
 * Pure geometry helpers for the PDF viewer.
 *
 * Keeping this math out of the component makes zoom, rotation and page
 * positioning predictable (and unit-testable) without touching React or
 * pdf.js.
 */

export interface PageInfo {
  /** Page width in PDF points, before any rotation. */
  width: number;
  /** Page height in PDF points, before any rotation. */
  height: number;
  /** The PDF's own page rotation (0/90/180/270). */
  rotate: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;
export type ZoomMode = "fit-width" | "fit-page" | "custom";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
export const PAGE_GAP = 16;
export const HORIZONTAL_GUTTER = 32;
export const VERTICAL_GUTTER = 16;

/** US Letter, only used until the first page reports its real size. */
export const DEFAULT_PAGE_INFO: PageInfo = {
  width: 612,
  height: 792,
  rotate: 0,
};

export function normalizeRotation(degrees: number): Rotation {
  const normalized = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  return normalized as Rotation;
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

/**
 * How far the on-screen scale may drift from the scale the canvas was last
 * rasterized at before a new (expensive, visibly blanking) raster is needed.
 * Zooming inside this band is handled purely with a CSS transform; anything
 * beyond it is re-rasterized once the zoom settles so pages stay crisp.
 */
export const RENDER_SCALE_MIN_RATIO = 0.95;
export const RENDER_SCALE_MAX_RATIO = 1.05;

/** Round away float noise so an equivalent scale never triggers a re-render. */
export function roundScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.round(scale * 1000) / 1000;
}

/**
 * Whether the canvas needs to be re-rasterized for the current display scale.
 * A raster is expensive and briefly upscaled in between, so this is kept
 * deliberately stingy.
 */
export function shouldCommitRenderScale(
  renderScale: number,
  displayScale: number,
): boolean {
  if (!Number.isFinite(renderScale) || renderScale <= 0) return true;
  if (!Number.isFinite(displayScale) || displayScale <= 0) return false;

  const ratio = displayScale / renderScale;
  return ratio < RENDER_SCALE_MIN_RATIO || ratio > RENDER_SCALE_MAX_RATIO;
}

/** Per-page info with page 1 (or the default) as a fallback estimate. */
export function pageInfoFor(
  sizes: ReadonlyMap<number, PageInfo>,
  pageNumber: number,
): PageInfo {
  return sizes.get(pageNumber) ?? sizes.get(1) ?? DEFAULT_PAGE_INFO;
}

/**
 * Size a page occupies once the PDF's own rotation and the user's rotation
 * are combined.
 */
export function displayedPageSize(info: PageInfo, userRotation: number): PageSize {
  const rotation = normalizeRotation(info.rotate + userRotation);
  return rotation % 180 === 0
    ? { width: info.width, height: info.height }
    : { width: info.height, height: info.width };
}

export function maxDisplayedPageSize(
  sizes: ReadonlyMap<number, PageInfo>,
  numPages: number,
  userRotation: number,
): PageSize {
  let width = 0;
  let height = 0;

  for (let page = 1; page <= numPages; page += 1) {
    const size = displayedPageSize(pageInfoFor(sizes, page), userRotation);
    width = Math.max(width, size.width);
    height = Math.max(height, size.height);
  }

  if (width <= 0 || height <= 0) {
    return displayedPageSize(DEFAULT_PAGE_INFO, userRotation);
  }

  return { width, height };
}

export interface EffectiveScaleArgs {
  mode: ZoomMode;
  customScale: number;
  sizes: ReadonlyMap<number, PageInfo>;
  numPages: number;
  userRotation: number;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * The single scale the whole document renders at. Fit modes are derived from
 * the measured viewport; custom mode uses the stored zoom factor.
 */
export function computeEffectiveScale(args: EffectiveScaleArgs): number {
  if (args.mode === "custom") {
    return clampScale(args.customScale);
  }

  const largest = maxDisplayedPageSize(args.sizes, args.numPages, args.userRotation);
  const availableWidth = Math.max(args.viewportWidth - HORIZONTAL_GUTTER * 2, 1);
  const widthScale = availableWidth / Math.max(largest.width, 1);

  if (args.mode === "fit-width") {
    return clampScale(widthScale);
  }

  const availableHeight = Math.max(args.viewportHeight - VERTICAL_GUTTER * 2, 1);
  return clampScale(Math.min(widthScale, availableHeight / Math.max(largest.height, 1)));
}

export interface PageMetrics {
  widths: number[];
  heights: number[];
  /** Absolute top offset of each page inside the scroll container. */
  offsets: number[];
  /** Absolute rotation each page is rendered with (PDF + user rotation). */
  rotations: Rotation[];
  /** Total scrollable height, including the trailing gap. */
  totalSize: number;
  /** Width of the scrollable column, never narrower than the viewport. */
  contentWidth: number;
  maxWidth: number;
}

export interface BuildPageMetricsArgs {
  sizes: ReadonlyMap<number, PageInfo>;
  numPages: number;
  userRotation: number;
  scale: number;
  gap?: number;
  viewportWidth?: number;
}

export function buildPageMetrics(args: BuildPageMetricsArgs): PageMetrics {
  const { sizes, numPages, userRotation, scale } = args;
  const gap = args.gap ?? PAGE_GAP;
  const viewportWidth = args.viewportWidth ?? 0;

  const widths: number[] = [];
  const heights: number[] = [];
  const offsets: number[] = [];
  const rotations: Rotation[] = [];

  let top = 0;
  let maxWidth = 0;

  for (let page = 1; page <= numPages; page += 1) {
    const info = pageInfoFor(sizes, page);
    const size = displayedPageSize(info, userRotation);
    const width = size.width * scale;
    const height = size.height * scale;

    widths.push(width);
    heights.push(height);
    offsets.push(top);
    rotations.push(normalizeRotation(info.rotate + userRotation));

    top += height + gap;
    maxWidth = Math.max(maxWidth, width);
  }

  return {
    widths,
    heights,
    offsets,
    rotations,
    totalSize: top,
    contentWidth:
      numPages === 0
        ? viewportWidth
        : Math.max(viewportWidth, maxWidth + HORIZONTAL_GUTTER * 2),
    maxWidth,
  };
}

/** Index (0-based) of the last page whose top is at or above `probe`. */
export function pageIndexAtOffset(offsets: readonly number[], probe: number): number {
  if (offsets.length === 0) return 0;

  let low = 0;
  let high = offsets.length - 1;
  let result = 0;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] <= probe) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

/**
 * Scroll offset that keeps the point under the cursor fixed while the content
 * grows by `ratio`.
 */
export function anchoredScrollPosition(
  scroll: number,
  anchorOffset: number,
  ratio: number,
): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return scroll;
  return Math.max(0, (scroll + anchorOffset) * ratio - anchorOffset);
}

/**
 * Geometry of the scroll column, in the same units as the scroll offsets.
 *
 * The column is centred with `margin: 0 auto`, so once it is narrower than the
 * viewport it does not start at x=0 — which is exactly why a plain
 * `scroll * ratio` anchor drifts during zoom.
 */
export interface ZoomAnchorLayout {
  /** Width of the scrollable column (`PageMetrics.contentWidth`). */
  contentWidth: number;
  /** Width of the scroll viewport (`scrollElement.clientWidth`). */
  viewportWidth: number;
  /** Absolute top offset of each page inside the column. */
  offsets: readonly number[];
  /** Displayed width of each page, in CSS px. */
  widths: readonly number[];
  /** Displayed height of each page, in CSS px. */
  heights: readonly number[];
}

/**
 * A point pinned under the cursor: which page it sits on and where inside that
 * page, as fractions of the page's displayed box. Storing it page-relative
 * (instead of as an absolute content coordinate) keeps the anchor exact across
 * a re-layout, because the fixed inter-page gaps and the centring do not scale
 * with the zoom.
 */
export interface ZoomAnchor {
  pageIndex: number;
  relX: number;
  relY: number;
  /** Pointer position inside the scroll viewport, in CSS px. */
  pointerX: number;
  pointerY: number;
}

/** Horizontal offset of the centred scroll column inside the viewport. */
function contentLeft(layout: ZoomAnchorLayout): number {
  return Math.max(0, (layout.viewportWidth - layout.contentWidth) / 2);
}

/** Left edge of a centred page inside the scroll column. */
function pageLeft(layout: ZoomAnchorLayout, pageIndex: number): number {
  const width = layout.widths[pageIndex] || 1;
  return (layout.contentWidth - width) / 2;
}

/** Pin the content point under the pointer, using the current layout. */
export function captureZoomAnchor(
  layout: ZoomAnchorLayout,
  scrollLeft: number,
  scrollTop: number,
  pointerX: number,
  pointerY: number,
): ZoomAnchor {
  if (layout.offsets.length === 0) {
    return { pageIndex: 0, relX: 0, relY: 0, pointerX, pointerY };
  }

  const pageIndex = Math.min(
    pageIndexAtOffset(layout.offsets, scrollTop + pointerY),
    layout.offsets.length - 1,
  );
  const width = layout.widths[pageIndex] || 1;
  const height = layout.heights[pageIndex] || 1;

  return {
    pageIndex,
    relX:
      (pointerX - (contentLeft(layout) + pageLeft(layout, pageIndex) - scrollLeft)) /
      width,
    relY: (scrollTop + pointerY - layout.offsets[pageIndex]) / height,
    pointerX,
    pointerY,
  };
}

/**
 * Scroll offsets that put the anchored content point back under the pointer in
 * a new layout. Exact for variable page sizes, fixed inter-page gaps and the
 * horizontal centring; the browser clamps to the real scroll range.
 */
export function anchoredScrollForZoom(
  layout: ZoomAnchorLayout,
  anchor: ZoomAnchor,
): { scrollLeft: number; scrollTop: number } {
  if (layout.offsets.length === 0) {
    return { scrollLeft: 0, scrollTop: 0 };
  }

  const pageIndex = Math.min(Math.max(anchor.pageIndex, 0), layout.offsets.length - 1);
  const width = layout.widths[pageIndex] || 1;
  const height = layout.heights[pageIndex] || 1;

  return {
    scrollLeft: Math.max(
      0,
      contentLeft(layout) + pageLeft(layout, pageIndex) + anchor.relX * width - anchor.pointerX,
    ),
    scrollTop: Math.max(
      0,
      layout.offsets[pageIndex] + anchor.relY * height - anchor.pointerY,
    ),
  };
}

/** Anchor geometry of the laid-out document, ready for the zoom helpers. */
export function zoomAnchorLayout(
  metrics: PageMetrics,
  viewportWidth: number,
): ZoomAnchorLayout {
  return {
    contentWidth: metrics.contentWidth,
    viewportWidth,
    offsets: metrics.offsets,
    widths: metrics.widths,
    heights: metrics.heights,
  };
}

/** Device-pixel-ratio ceiling for a page canvas, to bound memory use. */
export const MAX_DEVICE_PIXEL_RATIO = 2;
/** Browsers stop rendering canvases reliably past this edge length. */
export const MAX_CANVAS_EDGE = 8192;
/** Rough bitmap budget for one page canvas (a 4000x5000 canvas fits). */
export const MAX_CANVAS_PIXELS = 24_000_000;

/**
 * Pixel ratio to rasterize a page at. Keeps text crisp on HiDPI screens while
 * refusing to allocate an unbounded bitmap at extreme zoom levels.
 */
export function canvasPixelRatio(
  renderWidth: number,
  renderHeight: number,
  devicePixelRatio: number,
): number {
  const width = Math.max(renderWidth, 1);
  const height = Math.max(renderHeight, 1);
  const device =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;

  let ratio = Math.min(device, MAX_DEVICE_PIXEL_RATIO);

  const longestEdge = Math.max(width, height) * ratio;
  if (longestEdge > MAX_CANVAS_EDGE) {
    ratio *= MAX_CANVAS_EDGE / longestEdge;
  }

  const pixels = width * height * ratio * ratio;
  if (pixels > MAX_CANVAS_PIXELS) {
    ratio *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  }

  return Math.max(0.25, ratio);
}
