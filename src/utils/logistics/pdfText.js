// Browser-side PDF text extraction via pdf.js. Loaded lazily (dynamic
// import) from the pull sheet import modal so pdf.js stays out of the main
// bundle for everyone who never imports a pull sheet.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { textContentToItems } from './pullSheetParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Returns [{ items: [{ str, x, y, height }] }], one entry per page.
export async function extractPdfPages(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      pages.push({ items: textContentToItems(await page.getTextContent()) });
    }
    return pages;
  } finally {
    doc.destroy();
  }
}
