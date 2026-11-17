import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_INFO,
  HORIZONTAL_GUTTER,
  MAX_CANVAS_EDGE,
  MAX_CANVAS_PIXELS,
  MAX_SCALE,
  MIN_SCALE,
  anchoredScrollForZoom,
  anchoredScrollPosition,
  buildPageMetrics,
  canvasPixelRatio,
  captureZoomAnchor,
  clampScale,
  computeEffectiveScale,
  displayedPageSize,
  normalizeRotation,
  pageIndexAtOffset,
  roundScale,
  shouldCommitRenderScale,
  zoomAnchorLayout,
  type PageInfo,
} from "@/features/Reader/data/viewerMath";

function sizes(entries: Array<[number, PageInfo]>): Map<number, PageInfo> {
  return new Map(entries);
}

const LETTER: PageInfo = { width: 612, height: 792, rotate: 0 };

describe("viewerMath — rotation", () => {
  it("normalizes any degree value into a quarter turn", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
  });

  it("swaps dimensions only for quarter turns", () => {
    expect(displayedPageSize(LETTER, 0)).toEqual({ width: 612, height: 792 });
    expect(displayedPageSize(LETTER, 180)).toEqual({ width: 612, height: 792 });
    expect(displayedPageSize(LETTER, 90)).toEqual({ width: 792, height: 612 });
    expect(displayedPageSize(LETTER, 270)).toEqual({ width: 792, height: 612 });
  });

  it("adds the PDF's own rotation to the user's rotation", () => {
    const scanned: PageInfo = { width: 612, height: 792, rotate: 90 };

    expect(displayedPageSize(scanned, 0)).toEqual({ width: 792, height: 612 });
    expect(displayedPageSize(scanned, 90)).toEqual({ width: 612, height: 792 });
    expect(displayedPageSize(scanned, 180)).toEqual({ width: 792, height: 612 });
  });
});

describe("viewerMath — scale", () => {
  it("clamps custom zoom into the supported range", () => {
    expect(clampScale(10)).toBe(MAX_SCALE);
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it("derives fit-width from the viewport and the widest page", () => {
    const scale = computeEffectiveScale({
      mode: "fit-width",
      customScale: 1,
      sizes: sizes([[1, { width: 600, height: 800, rotate: 0 }]]),
      numPages: 1,
      userRotation: 0,
      viewportWidth: 600 + HORIZONTAL_GUTTER * 2,
      viewportHeight: 800,
    });

    expect(scale).toBeCloseTo(1);
  });

  it("uses the smaller ratio for fit-page", () => {
    const scale = computeEffectiveScale({
      mode: "fit-page",
      customScale: 1,
      sizes: sizes([[1, { width: 600, height: 800, rotate: 0 }]]),
      numPages: 1,
      userRotation: 0,
      viewportWidth: 1200,
      viewportHeight: 432,
    });

    // Height is the constraint: (432 - 32) / 800.
    expect(scale).toBeCloseTo(0.5);
  });

  it("does not collapse to zero before the container is measured", () => {
    const scale = computeEffectiveScale({
      mode: "fit-width",
      customScale: 1,
      sizes: sizes([[1, LETTER]]),
      numPages: 1,
      userRotation: 0,
      viewportWidth: 0,
      viewportHeight: 0,
    });

    expect(scale).toBe(MIN_SCALE);
  });

  it("uses the fallback page size when nothing has been measured", () => {
    const scale = computeEffectiveScale({
      mode: "fit-width",
      customScale: 1,
      sizes: sizes([]),
      numPages: 3,
      userRotation: 0,
      viewportWidth: DEFAULT_PAGE_INFO.width + HORIZONTAL_GUTTER * 2,
      viewportHeight: 900,
    });

    expect(scale).toBeCloseTo(1);
  });

  it("skips fit math for custom zoom", () => {
    const scale = computeEffectiveScale({
      mode: "custom",
      customScale: 1.75,
      sizes: sizes([[1, LETTER]]),
      numPages: 1,
      userRotation: 0,
      viewportWidth: 1200,
      viewportHeight: 900,
    });

    expect(scale).toBe(1.75);
  });
});

describe("viewerMath — page layout", () => {
  const uniform = sizes([
    [1, { width: 600, height: 800, rotate: 0 }],
    [2, { width: 600, height: 800, rotate: 0 }],
    [3, { width: 600, height: 800, rotate: 0 }],
  ]);

  it("builds offsets, sizes and the scrollable column", () => {
    const metrics = buildPageMetrics({
      sizes: uniform,
      numPages: 3,
      userRotation: 0,
      scale: 0.5,
      gap: 10,
      viewportWidth: 100,
    });

    expect(metrics.widths).toEqual([300, 300, 300]);
    expect(metrics.heights).toEqual([400, 400, 400]);
    expect(metrics.offsets).toEqual([0, 410, 820]);
    expect(metrics.totalSize).toBe(1230);
    expect(metrics.maxWidth).toBe(300);
    expect(metrics.contentWidth).toBe(300 + HORIZONTAL_GUTTER * 2);
    expect(metrics.rotations).toEqual([0, 0, 0]);
  });

  it("never makes the column narrower than the viewport", () => {
    const metrics = buildPageMetrics({
      sizes: uniform,
      numPages: 1,
      userRotation: 0,
      scale: 0.5,
      viewportWidth: 1200,
    });

    expect(metrics.contentWidth).toBe(1200);
  });

  it("falls back to page 1 for pages that have not loaded yet", () => {
    const metrics = buildPageMetrics({
      sizes: sizes([[1, { width: 600, height: 800, rotate: 0 }]]),
      numPages: 2,
      userRotation: 0,
      scale: 1,
      gap: 0,
    });

    expect(metrics.heights).toEqual([800, 800]);
    expect(metrics.offsets).toEqual([0, 800]);
  });

  it("returns empty metrics before the document loads", () => {
    const metrics = buildPageMetrics({
      sizes: sizes([]),
      numPages: 0,
      userRotation: 0,
      scale: 1,
    });

    expect(metrics.offsets).toEqual([]);
    expect(metrics.totalSize).toBe(0);
    expect(metrics.contentWidth).toBe(0);
  });

  it("records the combined rotation for each page", () => {
    const rotated = sizes([
      [1, { width: 600, height: 800, rotate: 90 }],
      [2, { width: 600, height: 800, rotate: 0 }],
    ]);
    const metrics = buildPageMetrics({
      sizes: rotated,
      numPages: 2,
      userRotation: 90,
      scale: 1,
      gap: 0,
    });

    expect(metrics.rotations).toEqual([180, 90]);
    expect(metrics.widths).toEqual([600, 800]);
    expect(metrics.heights).toEqual([800, 600]);
  });
});

describe("viewerMath — current page", () => {
  const offsets = [0, 410, 820];

  it("finds the page at or above the probe", () => {
    expect(pageIndexAtOffset(offsets, -50)).toBe(0);
    expect(pageIndexAtOffset(offsets, 0)).toBe(0);
    expect(pageIndexAtOffset(offsets, 409)).toBe(0);
    expect(pageIndexAtOffset(offsets, 410)).toBe(1);
    expect(pageIndexAtOffset(offsets, 900)).toBe(2);
  });

  it("handles an empty document", () => {
    expect(pageIndexAtOffset([], 100)).toBe(0);
  });
});

describe("viewerMath — zoom anchoring", () => {
  it("keeps the point under the cursor fixed", () => {
    // Cursor sits 50px below the top while scrolled to 100; at 2x that same
    // content point must stay 50px below the top.
    expect(anchoredScrollPosition(100, 50, 2)).toBe(250);
  });

  it("never scrolls negative", () => {
    expect(anchoredScrollPosition(0, 10, 0.5)).toBe(0);
  });

  it("ignores invalid ratios", () => {
    expect(anchoredScrollPosition(123, 10, 0)).toBe(123);
    expect(anchoredScrollPosition(123, 10, Number.NaN)).toBe(123);
  });
});

describe("viewerMath — render scale", () => {
  it("rounds away float noise", () => {
    expect(roundScale(1.23456)).toBe(1.235);
    expect(roundScale(0.5)).toBe(0.5);
    expect(roundScale(Number.NaN)).toBe(1);
  });

  it("keeps small drift inside the band as a pure CSS transform", () => {
    expect(shouldCommitRenderScale(1, 1)).toBe(false);
    expect(shouldCommitRenderScale(1, 1.05)).toBe(false);
    expect(shouldCommitRenderScale(1, 0.95)).toBe(false);
    expect(shouldCommitRenderScale(0.8, 0.83)).toBe(false);
  });

  it("requests a crisp new raster once the drift is noticeable", () => {
    expect(shouldCommitRenderScale(1, 1.06)).toBe(true);
    expect(shouldCommitRenderScale(1, 0.94)).toBe(true);
    expect(shouldCommitRenderScale(1, 2)).toBe(true);
  });

  it("treats a missing raster as needing a render", () => {
    expect(shouldCommitRenderScale(0, 1)).toBe(true);
    expect(shouldCommitRenderScale(Number.NaN, 1)).toBe(true);
  });

  it("never triggers a render for an unmeasured display scale", () => {
    expect(shouldCommitRenderScale(1, 0)).toBe(false);
    expect(shouldCommitRenderScale(1, Number.NaN)).toBe(false);
  });
});

describe("viewerMath — pointer-anchored zoom", () => {
  const sizesFor = sizes([
    [1, { width: 600, height: 400, rotate: 0 }],
    [2, { width: 600, height: 600, rotate: 0 }],
  ]);

  function layoutAt(scale: number, viewportWidth: number) {
    const metrics = buildPageMetrics({
      sizes: sizesFor,
      numPages: 2,
      userRotation: 0,
      scale,
      gap: 20,
      viewportWidth,
    });
    return zoomAnchorLayout(metrics, viewportWidth);
  }

  it("exposes the metrics the anchor math needs", () => {
    const layout = layoutAt(1, 1000);

    expect(layout.viewportWidth).toBe(1000);
    expect(layout.contentWidth).toBe(1000);
    expect(layout.offsets).toEqual([0, 420]);
    expect(layout.widths).toEqual([600, 600]);
    expect(layout.heights).toEqual([400, 600]);
  });

  it("keeps the anchored point under the pointer across a re-layout", () => {
    const before = layoutAt(1, 500);
    const anchor = captureZoomAnchor(before, 200, 380, 250, 100);

    expect(anchor.pageIndex).toBe(1);
    expect(anchor.relY).toBeCloseTo(0.1);

    const after = layoutAt(1.5, 500);
    const next = anchoredScrollForZoom(after, anchor);

    // The page-relative point under the pointer is unchanged, and the fixed
    // 20px gap is accounted for (a naive content-ratio zoom would say 620).
    expect(next.scrollTop).toBeCloseTo(610);
    expect((next.scrollTop + anchor.pointerY - after.offsets[1]) / after.heights[1]).toBeCloseTo(
      0.1,
    );
    expect((next.scrollLeft + anchor.pointerX - (after.contentWidth - after.widths[1]) / 2) / after.widths[1]).toBeCloseTo(
      anchor.relX,
    );
  });

  it("does not drift when the column grows past the viewport", () => {
    const before = layoutAt(0.5, 500);
    const anchor = captureZoomAnchor(before, 0, 0, 350, 50);
    const after = layoutAt(2, 500);
    const next = anchoredScrollForZoom(after, anchor);

    const pageLeft = (after.contentWidth - after.widths[0]) / 2;
    expect((next.scrollLeft + 350 - pageLeft) / after.widths[0]).toBeCloseTo(anchor.relX);
    expect(Math.max(0, next.scrollLeft)).toBeCloseTo(next.scrollLeft);
  });

  it("stores page-relative coordinates, not document offsets", () => {
    const layout = layoutAt(1, 500);
    const anchor = captureZoomAnchor(layout, 0, 100, 100, 100);

    expect(anchor).toEqual({
      pageIndex: 0,
      relX: expect.any(Number),
      relY: expect.any(Number),
      pointerX: 100,
      pointerY: 100,
    });
    expect(anchor.relY).toBeCloseTo(0.5);
  });

  it("returns a zero scroll for an empty document", () => {
    const anchor = captureZoomAnchor(
      { contentWidth: 0, viewportWidth: 0, offsets: [], widths: [], heights: [] },
      10,
      10,
      5,
      5,
    );
    expect(anchor).toEqual({ pageIndex: 0, relX: 0, relY: 0, pointerX: 5, pointerY: 5 });
    expect(
      anchoredScrollForZoom(
        { contentWidth: 0, viewportWidth: 0, offsets: [], widths: [], heights: [] },
        anchor,
      ),
    ).toEqual({ scrollLeft: 0, scrollTop: 0 });
  });
});

describe("viewerMath — canvas pixel ratio", () => {
  it("uses the device ratio up to 2x", () => {
    expect(canvasPixelRatio(600, 800, 1)).toBe(1);
    expect(canvasPixelRatio(600, 800, 1.5)).toBe(1.5);
    expect(canvasPixelRatio(600, 800, 3)).toBe(2);
    expect(canvasPixelRatio(600, 800, Number.NaN)).toBe(1);
  });

  it("caps the longest edge", () => {
    const ratio = canvasPixelRatio(5000, 1000, 2);
    expect(5000 * ratio).toBeCloseTo(MAX_CANVAS_EDGE);
    expect(1000 * ratio).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
  });

  it("caps the bitmap area", () => {
    const ratio = canvasPixelRatio(4000, 4000, 2);
    expect(4000 * 4000 * ratio * ratio).toBeCloseTo(MAX_CANVAS_PIXELS);
    expect(4000 * ratio).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
  });

  it("never returns a zero ratio", () => {
    expect(canvasPixelRatio(0, 0, 1)).toBeGreaterThan(0);
    expect(canvasPixelRatio(100000, 100000, 4)).toBeGreaterThanOrEqual(0.25);
  });
});
