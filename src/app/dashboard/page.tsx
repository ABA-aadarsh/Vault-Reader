"use client";

import PDFViewerWrapper from "@/features/PDFViewer/ClientSafePDFWrapper";

export default function Page() {
  return (
    <div>
      <PDFViewerWrapper 
        fileUrl="https://pdf.easycsit.com/notes/Introduction%20to%20Object%20Oriented%20Programming1752849860330.pdf"
      />
    </div>
  );
}
