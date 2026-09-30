/** Extracts transcript lines from a PDF entirely in the browser; nothing is uploaded. */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { linesFromItems, type PositionedText } from './lines';
import { parseTranscriptLines, type ParseResult } from './parseRows';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function readPdfLines(data: ArrayBuffer): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PositionedText[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, it.transform);
      items.push({ str: it.str, x, y });
    }
    lines.push(...linesFromItems(items));
  }
  await doc.cleanup();
  return lines;
}

export async function parseTranscriptPdf(file: File): Promise<ParseResult> {
  const lines = await readPdfLines(await file.arrayBuffer());
  const result = parseTranscriptLines(lines);
  if (!result.rows.length)
    result.warnings.unshift(
      "No courses were found. This importer reads UNH law transcripts (official Parchment PDF or unofficial Banner PDF); scanned images can't be read — enter courses manually instead.",
    );
  return result;
}
