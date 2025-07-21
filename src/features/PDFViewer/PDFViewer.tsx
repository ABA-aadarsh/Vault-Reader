"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileText,
  Loader2
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import Image from "next/image";
import { Button, buttonVariants } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PDFViewerProps {
  fileUrl?: string;
  className?: string;
}

export const PDFViewer = ({
  fileUrl = "https://pdf.easycsit.com/notes/Introduction%20to%20Object%20Oriented%20Programming1752849860330.pdf",
  className = ""
}: PDFViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState(1);
  const [visualScale, setVisualScale] = useState(1); // CSS transform scale for smooth zoom
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitToWidth, setFitToWidth] = useState(false);
  const [pageHeight, setPageHeight] = useState(850);
  const [pageWidth, setPageWidth] = useState(600);
  const [isZooming, setIsZooming] = useState(false);
  const firstPageRef = useRef<HTMLDivElement>(null);
  const [virtualizerKey, setVirtualizerKey] = useState(0);

  // Debounce timer for scale updates
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Calculate scaled dimensions
  const scaledPageHeight = pageHeight * scale;
  const pageMargin = 16;

  // Simplified virtualizer setup with consistent scaling
  const rowVirtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => containerRef.current,
    estimateSize: () => scaledPageHeight + pageMargin,
    overscan: 2,
    getItemKey: (index) => `page-${index}-${virtualizerKey}`, // Include key to force refresh
  });

  const onLoad = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  };

  const onLoadError = (error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
    setIsLoading(false);
  };

  const onFirstPageLoadSuccess = (page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageHeight(viewport.height);
    setPageWidth(viewport.width);
  };

  // Smooth scale update function with CSS transform approach
  const updateScale = useCallback((newScale: number) => {
    const clampedScale = Math.min(Math.max(newScale, 0.3), 5);

    // Immediate visual feedback with CSS transform
    setVisualScale(clampedScale);
    setIsZooming(true);

    // Clear existing debounce timer
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // Debounced actual scale update for React PDF
    debounceTimer.current = setTimeout(() => {
      setScale(clampedScale);
      setIsZooming(false);
      setVirtualizerKey(prev => prev + 1);
    }, 300);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        // Moderate sensitivity for smooth but responsive zooming
        const delta = -e.deltaY / 800;
        const newScale = visualScale + delta;
        updateScale(newScale);
      }
    },
    [visualScale, updateScale]
  );

  const zoomIn = () => {
    const newScale = Math.min(visualScale + 0.15, 5.0);
    updateScale(newScale);
    setFitToWidth(false);
  };

  const zoomOut = () => {
    const newScale = Math.max(visualScale - 0.15, 0.3);
    updateScale(newScale);
    setFitToWidth(false);
  };

  const resetZoom = () => {
    updateScale(1);
    setFitToWidth(false);
  };

  const toggleFitToWidth = () => {
    if (fitToWidth) {
      resetZoom();
    } else {
      const newScale = 1.2;
      updateScale(newScale);
      setFitToWidth(true);
    }
  };

  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Fixed goToPage function with proper scroll calculation
  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= numPages && containerRef.current) {
      const pageIndex = pageNum - 1;
      const scrollTop = pageIndex * (scaledPageHeight + pageMargin);

      containerRef.current.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
      setCurrentPage(pageNum);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current && numPages > 0) {
        const scrollTop = containerRef.current.scrollTop;
        const itemHeight = scaledPageHeight + pageMargin;
        const currentPageIndex = Math.floor((scrollTop + itemHeight * 0.3) / itemHeight);
        const newCurrentPage = Math.max(1, Math.min(currentPageIndex + 1, numPages));
        if (newCurrentPage !== currentPage) {
          setCurrentPage(newCurrentPage);
        }
      }
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [scaledPageHeight, numPages, currentPage]);

  // Reduced frequency of virtualizer refresh to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      if (rowVirtualizer) {
        rowVirtualizer.measure();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [virtualizerKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  if (error) {
    return (
      <div className={`h-screen w-full bg-background text-foreground flex items-center justify-center ${className}`}>
        <div className="text-center p-8">
          <FileText className="mx-auto h-16 w-16 text-red-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load PDF</h3>
          <p className="text-destructive-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full bg-secondary text-foreground overflow-hidden flex flex-col ${className}`}>
      {/* Enhanced Toolbar */}
      <div className="bg-card shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <Image
                width={50}
                height={50}
                className="object-contain invert"
                src={"/dragon-logo.png"}
                alt="V"
              />
              <span className="hidden sm:inline">Dragon PDF Viewer</span>
            </div>
            {numPages > 0 && (
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  variant={"ghost"}
                  className="cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center space-x-2 text-sm">
                  <input
                    type="number"
                    min="1"
                    max={numPages}
                    value={currentPage}
                    onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-card-foreground rounded text-center text-xs"
                  />
                  <span>of {numPages}</span>
                </div>
                <Button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                  variant={"ghost"}
                  className="cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center space-x-1 mr-4">
              <span className="text-sm">Zoom: {(visualScale * 100).toFixed(0)}%</span>
            </div>

            <Button
              onClick={zoomOut}
              title="Zoom Out"
              variant={"ghost"}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Button
              onClick={resetZoom}
              variant={"outline"}
            >
              {(visualScale * 100).toFixed(0)}%
            </Button>

            <Button
              onClick={zoomIn}
              variant={"ghost"}
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <div className="h-4 w-px bg-gray-300" />

            <Button
              onClick={toggleFitToWidth}
              variant="outline"
            >
              Fit Width
            </Button>

            <Button
              onClick={rotate}
              variant={"ghost"}
              title="Rotate"
            >
              <RotateCw className="h-4 w-4" />
            </Button>

            <Button
              onClick={toggleFullscreen}
              variant={"ghost"} title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            <a
              href={fileUrl}
              download
              className={buttonVariants({variant: "ghost"})}
              title="Download PDF"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p>Loading PDF...</p>
          </div>
        </div>
      )}

      {/* PDF Viewer Container */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto bg-background ${isLoading ? 'hidden' : ''}`}
        style={{ perspective: "1000px" }}
      >
        <div className="flex justify-center">
          <div
            style={{
              transform: `scale(${isZooming ? visualScale / scale : 1}) rotate(${rotation}deg)`,
              transformOrigin: "center top",
              transition: isZooming ? 'none' : 'transform 0.2s ease-out',
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
                width: fitToWidth ? "100%" : "auto",
              }}
            >
              <Document
                file={fileUrl}
                onLoadSuccess={onLoad}
                onLoadError={onLoadError}
                loading={
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                }
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const pageNumber = virtualRow.index + 1;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${scaledPageHeight + pageMargin}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="flex justify-center px-4 pb-4" style={{
                        height: `${scaledPageHeight}px`
                      }}>
                        <div
                          className="bg-card shadow-sm border border-accent"
                          ref={pageNumber === 1 ? firstPageRef : undefined}
                        >
                          <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderAnnotationLayer={false} // Disable to reduce flickering and errors
                            renderTextLayer={false} // Disable to prevent AbortException
                            width={fitToWidth && containerRef.current?.clientWidth ? Math.min(containerRef.current?.clientWidth * 0.9, 1200) : undefined}
                            onLoadSuccess={pageNumber === 1 ? onFirstPageLoadSuccess : undefined}
                            className={"dark:invert"}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Document>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs px-3 py-2 rounded hidden lg:block">
        <div>Ctrl + Wheel: Zoom</div>
      </div>
    </div>
  );
};