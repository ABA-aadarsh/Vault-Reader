"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Dynamic import with SSR disabled
const PDFViewer = dynamic(
  () => import("./PDFViewer").then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading PDF Viewer...</p>
        </div>
      </div>
    ),
  }
);

interface PDFViewerWrapperProps {
  fileUrl?: string;
  className?: string;
}

export default function PDFViewerWrapper({ fileUrl, className }: PDFViewerWrapperProps) {
  return <PDFViewer fileUrl={fileUrl} className={className} />;
}