"use client";

import type { Annotation, PdfDoc, PageMeta, Rect } from "./types";
import { getPdfjs } from "./pdfEngine";
import { hexToRgb } from "./utils";

type AnyDoc = any;

async function pdfLib() {
  return import("pdf-lib");
}

function rrect(r: Rect, pw: number, ph: number) {
  // normalized top-left -> pdf points bottom-left
  return {
    x: r.x * pw,
    y: (1 - r.y - r.h) * ph,
    w: r.w * pw,
    h: r.h * ph,
  };
}

function pt(x: number, y: number, pw: number, ph: number) {
  return { x: x * pw, y: (1 - y) * ph };
}

function rgb(hex: string, lib: any) {
  const c = hexToRgb(hex);
  return lib.rgb(c.r, c.g, c.b);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Rasterize a source page (used for true redaction, watermark baking, compression). */
async function rasterizePage(
  srcPdf: any,
  srcIndex: number,
  rotation: number,
  scale: number,
  crop?: Rect,
): Promise<{ png: Uint8Array; w: number; h: number }> {
  const page = await srcPdf.getPage(srcIndex + 1);
  const rot = ((page.rotate || 0) + rotation) % 360;
  const viewport = page.getViewport({ scale, rotation: rot });
  const canvas = document.createElement("canvas");
  const cw = crop ? crop.w * viewport.width : viewport.width;
  const ch = crop ? crop.h * viewport.height : viewport.height;
  canvas.width = Math.max(1, Math.round(cw));
  canvas.height = Math.max(1, Math.round(ch));
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = crop ? crop.x * viewport.width : 0;
  const oy = crop ? crop.y * viewport.height : 0;
  await page.render({
    canvasContext: ctx,
    viewport,
    transform: ox || oy ? [1, 0, 0, 1, -ox, -oy] : undefined,
  }).promise;
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const png = new Uint8Array(await blob.arrayBuffer());
  return { png, w: canvas.width, h: canvas.height };
}

export interface ExportOptions {
  /** Rasterize pages that carry applied redactions so text is truly removed. */
  applyRedactions?: boolean;
  /** Flatten (bake) all annotations permanently instead of annotating. */
  flatten?: boolean;
  /** Included page indexes (positional) to export; default all. */
  pageFilter?: number[];
}

export async function buildPdf(src: PdfDoc, opts: ExportOptions = {}): Promise<Uint8Array> {
  const lib = await pdfLib();
  const { PDFDocument, degrees, StandardFonts } = lib;
  const out = await PDFDocument.create();
  out.setProducer("PdfEditz (client-side)");
  out.setCreator("PdfEditz");
  out.setCreationDate(new Date());
  out.setModificationDate(new Date());

  const srcDoc = await PDFDocument.load(src.bytes, { ignoreEncryption: true, updateMetadata: false });
  // Copy each source page exactly once, reuse copies for duplicates.
  const copyCache = new Map<number, any>();
  const fonts = {
    Helvetica: await out.embedFont(StandardFonts.Helvetica),
    HelveticaBold: await out.embedFont(StandardFonts.HelveticaBold),
    TimesRoman: await out.embedFont(StandardFonts.TimesRoman),
    Courier: await out.embedFont(StandardFonts.Courier),
  };

  const pdfjs = await getPdfjs();
  const jsDoc = await pdfjs.getDocument({ data: src.bytes.slice(0) }).promise;

  const wanted = opts.pageFilter ? new Set(opts.pageFilter) : null;

  for (let pos = 0; pos < src.pages.length; pos++) {
    if (wanted && !wanted.has(pos)) continue;
    const meta: PageMeta = src.pages[pos];
    const annos = src.annotations.filter((a) => a.pageIndex === pos).sort((a, b) => a.z - b.z);
    if (meta.blank) {
      const page = out.addPage([meta.width || 612, meta.height || 792]);
      const { width: bw, height: bh } = page.getSize();
      if (meta.rotation) page.setRotation(degrees(meta.rotation % 360));
      await drawAnnotations(page, annos, out, fonts, lib, bw, bh);
      continue;
    }
    const mustRasterize = !!opts.applyRedactions && annos.some((a) => a.kind === "redact" && (a as any).applied);

    if (mustRasterize) {
      const { png, w, h } = await rasterizePage(jsDoc, meta.srcIndex, meta.rotation, 2, meta.crop);
      const img = await out.embedPng(png);
      const page = out.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
      // draw black boxes on top of rasterized page for the redact areas
      for (const a of annos.filter((x) => x.kind === "redact")) {
        for (const r of (a as any).rects as Rect[]) {
          const g = rrect(r, w, h);
          page.drawRectangle({ x: g.x, y: g.y, width: g.w, height: g.h, color: lib.rgb(0, 0, 0) });
        }
      }
      await drawAnnotations(page, annos.filter((x) => x.kind !== "redact"), out, fonts, lib, w, h);
      continue;
    }

    if (!copyCache.has(meta.srcIndex)) {
      const [copied] = await out.copyPages(srcDoc, [meta.srcIndex]);
      copyCache.set(meta.srcIndex, copied);
    }
    const copiedProto = copyCache.get(meta.srcIndex);
    const page = out.addPage(copiedProto);

    if (meta.rotation) {
      const base = page.getRotation().angle || 0;
      page.setRotation(degrees((base + meta.rotation) % 360));
    }
    if (meta.crop) {
      const { width, height } = page.getSize();
      const c = meta.crop;
      page.setCropBox(c.x * width, (1 - c.y - c.h) * height, c.w * width, c.h * height);
    }

    const { width: pw, height: ph } = page.getSize();
    await drawAnnotations(page, annos, out, fonts, lib, pw, ph);
  }

  return out.save({ useObjectStreams: true });
}

async function drawAnnotations(
  page: AnyDoc,
  annos: Annotation[],
  out: AnyDoc,
  fonts: Record<string, AnyDoc>,
  lib: any,
  pw: number,
  ph: number,
) {
  for (const a of annos) {
    switch (a.kind) {
      case "highlight": {
        for (const r of a.rects) {
          const g = rrect(r, pw, ph);
          page.drawRectangle({ x: g.x, y: g.y, width: g.w, height: g.h, color: rgb(a.color, lib), opacity: a.opacity });
        }
        break;
      }
      case "underline":
      case "strike": {
        for (const r of a.rects) {
          const g = rrect(r, pw, ph);
          const y = a.kind === "underline" ? g.y + g.h * 0.08 : g.y + g.h * 0.5;
          page.drawLine({ start: { x: g.x, y }, end: { x: g.x + g.w, y }, thickness: Math.max(1, ph * 0.0016), color: rgb(a.color, lib), opacity: a.opacity });
        }
        break;
      }
      case "squiggly": {
        for (const r of a.rects) {
          const g = rrect(r, pw, ph);
          const y = g.y + g.h * 0.12;
          const step = Math.max(4, g.w / 30);
          const pts: { x: number; y: number }[] = [];
          for (let x = 0; x <= g.w; x += step) pts.push({ x: g.x + x, y: y + (Math.round(x / step) % 2 ? step * 0.35 : 0) });
          for (let i = 0; i < pts.length - 1; i++) {
            page.drawLine({ start: pts[i], end: pts[i + 1], thickness: Math.max(1, ph * 0.0016), color: rgb(a.color, lib) });
          }
        }
        break;
      }
      case "rect": {
        const g = rrect(a.rect, pw, ph);
        page.drawRectangle({
          x: g.x,
          y: g.y,
          width: g.w,
          height: g.h,
          borderColor: rgb(a.stroke, lib),
          borderWidth: a.strokeWidth,
          color: a.fill === "none" ? undefined : rgb(a.fill, lib),
          opacity: a.opacity,
          borderOpacity: a.opacity,
        });
        break;
      }
      case "ellipse": {
        const g = rrect(a.rect, pw, ph);
        page.drawEllipse({
          x: g.x + g.w / 2,
          y: g.y + g.h / 2,
          xScale: g.w / 2,
          yScale: g.h / 2,
          borderColor: rgb(a.stroke, lib),
          borderWidth: a.strokeWidth,
          color: a.fill === "none" ? undefined : rgb(a.fill, lib),
          opacity: a.opacity,
          borderOpacity: a.opacity,
        });
        break;
      }
      case "line":
      case "arrow": {
        const p1 = pt(a.x1, a.y1, pw, ph);
        const p2 = pt(a.x2, a.y2, pw, ph);
        page.drawLine({ start: p1, end: p2, thickness: a.strokeWidth, color: rgb(a.stroke, lib), opacity: a.opacity });
        if (a.kind === "arrow") {
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const size = Math.max(6, a.strokeWidth * 3);
          const l = { x: p2.x - size * Math.cos(ang - Math.PI / 6), y: p2.y - size * Math.sin(ang - Math.PI / 6) };
          const r = { x: p2.x - size * Math.cos(ang + Math.PI / 6), y: p2.y - size * Math.sin(ang + Math.PI / 6) };
          page.drawLine({ start: p2, end: l, thickness: a.strokeWidth, color: rgb(a.stroke, lib) });
          page.drawLine({ start: p2, end: r, thickness: a.strokeWidth, color: rgb(a.stroke, lib) });
        }
        break;
      }
      case "draw": {
        for (const path of a.paths) {
          for (let i = 0; i < path.length - 1; i++) {
            const s = pt(path[i].x, path[i].y, pw, ph);
            const e = pt(path[i + 1].x, path[i + 1].y, pw, ph);
            page.drawLine({ start: s, end: e, thickness: a.strokeWidth, color: rgb(a.color, lib), opacity: a.opacity });
          }
        }
        break;
      }
      case "text": {
        const p = pt(a.x, a.y, pw, ph);
        const fontKey = a.bold ? (a.font === "Helvetica" ? "HelveticaBold" : a.font) : a.font;
        const font = fonts[fontKey] || fonts.Helvetica;
        const lines = a.text.split("\n");
        const lh = a.fontSize * 1.25;
        lines.forEach((line, i) => {
          page.drawText(line, {
            x: p.x,
            y: p.y - lh * (i + 1),
            size: a.fontSize,
            font,
            color: rgb(a.color, lib),
          });
        });
        break;
      }
      case "image":
      case "stamp": {
        const g = rrect(a.rect, pw, ph);
        const bytes = dataUrlToBytes(a.src);
        const isPng = a.src.includes("image/png");
        const img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const cx = g.x + g.w / 2;
        const cy = g.y + g.h / 2;
        page.drawImage(img, {
          x: g.x,
          y: g.y,
          width: g.w,
          height: g.h,
          opacity: a.opacity,
          rotate: lib.degrees(a.rotation || 0),
        });
        void cx;
        void cy;
        break;
      }
      case "redact": {
        for (const r of a.rects) {
          const g = rrect(r, pw, ph);
          page.drawRectangle({ x: g.x, y: g.y, width: g.w, height: g.h, color: lib.rgb(0, 0, 0) });
        }
        break;
      }
      case "note": {
        const p = pt(a.x, a.y, pw, ph);
        const size = Math.max(14, pw * 0.02);
        page.drawRectangle({ x: p.x - size / 2, y: p.y - size / 2, width: size, height: size, color: rgb(a.color || "#f59e0b", lib), borderColor: lib.rgb(0, 0, 0), borderWidth: 0.6, opacity: 0.95 });
        break;
      }
    }
  }
}

/** Merge several documents (each already page-edited) into one PDF. */
export async function mergeDocs(docs: PdfDoc[]): Promise<Uint8Array> {
  const lib = await pdfLib();
  const { PDFDocument } = lib;
  const out = await PDFDocument.create();
  out.setProducer("PdfEditz (client-side)");
  const pdfjs = await getPdfjs();
  for (const d of docs) {
    const srcDoc = await PDFDocument.load(d.bytes, { ignoreEncryption: true });
    for (const meta of d.pages) {
      const [pg] = await out.copyPages(srcDoc, [meta.srcIndex]);
      const added = out.addPage(pg);
      if (meta.rotation) added.setRotation(lib.degrees(((added.getRotation().angle || 0) + meta.rotation) % 360));
    }
    void pdfjs;
  }
  return out.save();
}

/** Extract a positional page range into a standalone PDF. */
export async function extractRange(src: PdfDoc, positions: number[]): Promise<Uint8Array> {
  return buildPdf(src, { pageFilter: positions, applyRedactions: true });
}

/** Insert blank pages anywhere (returns pages array augmented). */
export function makeBlankPage(w = 612, h = 792): PageMeta {
  return {
    id: `blank_${Math.random().toString(36).slice(2, 9)}`,
    srcIndex: -1,
    rotation: 0,
    blank: true,
    width: w,
    height: h,
  };
}
