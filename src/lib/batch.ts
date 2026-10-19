"use client";

import { buildPdf } from "./pdfExport";
import type { PdfDoc, RGB } from "./types";

/** Options for a document-wide watermark. */
export interface WatermarkOptions {
  text: string;
  opacity?: number;
  size?: number;
  color?: RGB;
  rotation?: number;
  diagonal?: boolean;
}

function bytesOf(u: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u.byteLength);
  new Uint8Array(ab).set(u);
  return ab;
}

/**
 * Stamp a repeating text watermark onto every copied page of a fresh PDF.
 * Runs fully client-side through pdf-lib (req 4, 31, 46).
 */
export async function watermarkBytes(src: PdfDoc, opts: WatermarkOptions): Promise<ArrayBuffer> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const source = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const copied = await doc.copyPages(source, source.getPageIndices());
  const col = opts.color ?? { r: 0.85, g: 0.1, b: 0.1 };
  const size = opts.size ?? 46;
  const opacity = opts.opacity ?? 0.18;
  for (const page of copied) {
    doc.addPage(page);
    const { width, height } = page.getSize();
    const text = opts.text || "CONFIDENTIAL";
    const textWidth = font.widthOfTextAtSize(text, size);
    if (opts.diagonal === false) {
      page.drawText(text, {
        x: Math.max(8, (width - textWidth) / 2),
        y: height / 2 - size / 2,
        size,
        font,
        color: rgb(col.r, col.g, col.b),
        opacity,
      });
    } else {
      // Tile the mark so it survives cropping and stays visible on any page size.
      const stepX = Math.max(220, textWidth + 120);
      const stepY = 200;
      const angle = opts.rotation ?? 35;
      for (let y = -height; y < height * 2; y += stepY) {
        for (let x = -width; x < width * 2; x += stepX) {
          page.drawText(text, {
            x,
            y,
            size,
            font,
            color: rgb(col.r, col.g, col.b),
            opacity,
            rotate: degrees(angle),
          });
        }
      }
    }
  }
  doc.setProducer("PdfEditz (client-side)");
  const out = await doc.save({ useObjectStreams: true });
  return bytesOf(out);
}

/**
 * Rebuild a document with pdf-lib so orphaned objects, metadata and edit
 * history are dropped — the safest compressor that never loses fidelity.
 * `quality` below 1 additionally flattens image-heavy pages through a canvas
 * re-encode, which is what actually shrinks scanned documents.
 */
export async function compressBytes(src: PdfDoc, quality = 0.72): Promise<ArrayBuffer> {
  const rebuilt = await buildPdf(src, { flatten: true, applyRedactions: true });
  const rebuiltAb = bytesOf(rebuilt);
  if (quality >= 1) return stripMetadata(rebuiltAb);

  const before = rebuiltAb.byteLength;
  const rasterized = await rasterizePdf(src, quality);
  if (rasterized && rasterized.byteLength < before * 0.85) return stripMetadata(rasterized);
  return stripMetadata(rebuiltAb);
}

/** Drop document metadata (author/title/producer) from a PDF in place. */
async function stripMetadata(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setProducer("PdfEditz");
  return bytesOf(await doc.save({ useObjectStreams: true }));
}

/** Re-encode every page as a JPEG and rebuild the PDF (heavy but effective). */
async function rasterizePdf(src: PdfDoc, quality: number): Promise<ArrayBuffer | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const { getPdfjs } = await import("./pdfEngine");
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({ data: src.bytes.slice(0) }).promise;
    const out = await PDFDocument.create();
    for (const meta of src.pages) {
      const page = await pdf.getPage(meta.srcIndex + 1);
      const viewport = page.getViewport({ scale: 1, rotation: meta.rotation });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const img = await out.embedJpg(dataUrlToBytes(dataUrl));
      const jpgPage = out.addPage([viewport.width, viewport.height]);
      jpgPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }
    await pdf.destroy();
    return bytesOf(await out.save({ useObjectStreams: true }));
  } catch (err) {
    console.warn("rasterize failed", err);
    return null;
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
