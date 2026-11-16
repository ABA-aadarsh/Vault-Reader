/**
 * pdf.js worker URL, kept separate from `react-pdf` so download code can
 * pre-fetch it without pulling the reader into its bundle.
 */
export const PDF_WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
