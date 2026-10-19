"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useStore } from "@/store/useStore";
import type { PdfDoc, PageMeta } from "@/lib/types";
import { uid } from "@/lib/utils";

/** Build a small multi-page demo PDF entirely in the browser. */
export async function makeDemoDoc(
  name: string,
  title: string,
  body: string,
  pageCount = 2,
): Promise<PdfDoc> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.15, 0.39, 0.92);

  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([612, 792]);
    const { width, height } = page.getSize();
    // Header band
    page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: accent });
    page.drawText("PdfEditz", {
      x: 48,
      y: height - 60,
      size: 26,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(name, {
      x: width - 48 - font.widthOfTextAtSize(name, 12),
      y: height - 54,
      size: 12,
      font,
      color: rgb(1, 1, 1),
    });

    page.drawText(i === 0 ? title : `${title} — page ${i + 1}`, {
      x: 48,
      y: height - 150,
      size: 20,
      font: bold,
      color: rgb(0.08, 0.11, 0.16),
    });

    const lines = wrap(body, 78);
    let y = height - 190;
    for (const line of lines) {
      if (y < 120) break;
      page.drawText(line, { x: 48, y, size: 12, font, color: rgb(0.18, 0.22, 0.29) });
      y -= 18;
    }

    // A few sample "form-ish" lines to look realistic
    y -= 12;
    page.drawText("Notes:", { x: 48, y, size: 12, font: bold, color: rgb(0.18, 0.22, 0.29) });
    y -= 20;
    for (let k = 0; k < 4; k++) {
      page.drawLine({
        start: { x: 48, y },
        end: { x: width - 48, y },
        thickness: 0.6,
        color: rgb(0.78, 0.82, 0.88),
      });
      y -= 26;
    }

    page.drawText("Generated locally by PdfEditz — no upload, no server.", {
      x: 48,
      y: 48,
      size: 9,
      font,
      color: rgb(0.55, 0.6, 0.68),
    });
  }

  const bytes = await pdf.save();
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const pages: PageMeta[] = Array.from({ length: pageCount }, (_, i) => ({
    id: uid("pg"),
    srcIndex: i,
    rotation: 0,
  }));

  return {
    id: uid("doc"),
    name,
    bytes: ab,
    size: ab.byteLength,
    pageCount,
    pages,
    annotations: [],
    outline: [{ title, page: 0 }],
    fields: [],
  };
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      if (line) out.push(line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

/** Seed two demo documents on a first-ever visit. */
export async function seedDemoDocs(): Promise<void> {
  try {
    const addDoc = useStore.getState().addDoc;
    const welcome = await makeDemoDoc(
      "Welcome.pdf",
      "Welcome to PdfEditz",
      "This document lives entirely in your browser. Open as many PDFs as you like — they appear as tabs. " +
        "Annotate with highlight, underline, strikethrough and squiggly marks. Draw freehand, drop shapes, " +
        "stamp images, add sticky notes and sign with your finger. Everything is processed locally with WebAssembly " +
        "and the File System Access API; nothing is ever uploaded. Your workspace is autosaved to IndexedDB, so a " +
        "refresh restores open tabs, zoom levels and scroll positions. Try pinching to zoom on a touchscreen, or " +
        "flip to the dark and sepia themes for a comfortable late-night read.",
      2,
    );
    addDoc(welcome);

    const contract = await makeDemoDoc(
      "Sample-Contract.pdf",
      "Service Agreement",
      "This Agreement is entered into between the parties as of the effective date. The provider shall deliver the " +
        "services described in the statement of work. Payment terms are net thirty days from invoice. Either party may " +
        "terminate for convenience with thirty days written notice. Confidential information shall be protected. " +
        "This agreement is governed by the laws of the jurisdiction of the provider. Please review the signature block " +
        "below and apply your digital signature before returning a signed copy.",
      3,
    );
    addDoc(contract);
  } catch {
    useStore.getState().toast("Could not create sample documents", "error");
  }
}