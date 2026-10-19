"use client";

import type { PdfDoc, PageMeta } from "@/lib/types";
import { uid } from "@/lib/utils";

export interface LoadResult {
  doc: PdfDoc;
  encrypted: boolean;
}

/** Load raw bytes into a PdfDoc metadata structure using pdf.js. */
export async function loadBytesToDoc(name: string, bytes: Uint8Array, password?: string): Promise<LoadResult> {
  const { getPdfjs, getPageText } = await import("@/lib/pdfEngine");
  const pdfjs = await getPdfjs();
  let pdf: any;
  try {
    pdf = await pdfjs.getDocument({ data: bytes.slice(0), password }).promise;
  } catch (e: any) {
    if (e?.name === "PasswordException" || /password/i.test(String(e?.message))) {
      throw new Error("PDF_PASSWORD_REQUIRED");
    }
    throw e;
  }
  const pageCount: number = pdf.numPages;
  const pages: PageMeta[] = [];
  for (let i = 0; i < pageCount; i++) {
    // Only read the first page dims lazily per page; read all for correctness (cheap).
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ id: uid("pg"), srcIndex: i, rotation: 0, width: vp.width, height: vp.height });
  }
  let outline: any[] = [];
  try {
    const raw = await pdf.getOutline();
    outline = await resolveOutline(pdf, raw ?? []);
  } catch {
    outline = [];
  }
  let fields: any[] = [];
  try {
    fields = await detectFields(pdf);
  } catch {
    fields = [];
  }
  await pdf.destroy();
  const doc: PdfDoc = {
    id: uid("doc"),
    name,
    bytes,
    size: bytes.byteLength,
    pageCount,
    pages,
    annotations: [],
    outline,
    fields,
    dirty: false,
  };
  return { doc, encrypted: !!password };
}

async function resolveOutline(pdf: any, items: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const it of items) {
    let pageIndex = 0;
    try {
      if (it.dest) {
        const dest = typeof it.dest === "string" ? await pdf.getDestination(it.dest) : it.dest;
        if (dest && dest[0]) {
          const idx = await pdf.getPageIndex(dest[0]);
          pageIndex = idx;
        }
      }
    } catch {
      /* ignore */
    }
    out.push({
      title: it.title || "(untitled)",
      pageIndex,
      children: it.items?.length ? await resolveOutline(pdf, it.items) : undefined,
    });
  }
  return out;
}

async function detectFields(pdf: any): Promise<any[]> {
  const fields: any[] = [];
  try {
    const anns = await pdf.getFieldObjects();
    if (!anns) return [];
    for (const name of Object.keys(anns)) {
      for (const f of anns[name]) {
        const t = f.type;
        let type: string = "text";
        if (t === "checkbox") type = "checkbox";
        else if (t === "radiobutton") type = "radio";
        else if (t === "combobox") type = "combo";
        else if (t === "listbox") type = "listbox";
        else if (t === "signature") type = "signature";
        else if (t === "button") type = "button";
        const pageIndex =
          f.page !== undefined && f.page !== null
            ? typeof f.page === "number"
              ? f.page
              : await pdf.getPageIndex(f.page)
            : 0;
        fields.push({
          name: f.name ?? name,
          type,
          value: f.value ?? "",
          options: (f.items ?? []).map((i: any) => (typeof i === "string" ? i : i.displayValue ?? i.exportValue)),
          pageIndex,
          readOnly: !!f.readOnly,
        });
      }
    }
  } catch {
    return [];
  }
  return fields;
}

const RECENT_KEY = "pdfeditz-recent";

export function addRecent(name: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [name, ...list.filter((n) => n !== name)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}