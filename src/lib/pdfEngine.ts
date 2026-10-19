"use client";

// pdf.js loader + page rendering helpers. Everything runs in the browser.

let pdfjsPromise: Promise<any> | null = null;

export async function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod: any) => {
      const lib = mod.default ?? mod;
      // Worker lives in /public (copied by scripts/copy-worker.mjs) — off-main-thread (R39).
      try {
        lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      } catch {
        /* ignore */
      }
      return lib;
    });
  }
  return pdfjsPromise;
}

export interface LoadedDoc {
  pdf: any;
  numPages: number;
  outline: any[] | null;
  fields: any[];
  encrypted: boolean;
}

export async function loadPdf(bytes: ArrayBuffer, password?: string): Promise<LoadedDoc> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(0),
    password,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  let outline: any[] = [];
  try {
    outline = (await pdf.getOutline()) || [];
  } catch {
    outline = [];
  }
  let fields: any[] = [];
  try {
    fields = await pdf.getFieldObjects();
  } catch {
    fields = [];
  }
  return { pdf, numPages: pdf.numPages, outline, fields, encrypted: false };
}

// Cache parsed pdf.js documents by key so scroll/zoom does not re-parse the file.
const docCache = new Map<string, Promise<any>>();

export function getCachedDoc(key: string, bytes: Uint8Array | ArrayBuffer): Promise<any> {
  let p = docCache.get(key);
  if (!p) {
    p = getPdfjs().then((pdfjs: any) =>
      pdfjs.getDocument({
        data: bytes.slice(0),
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise,
    );
    p.catch(() => docCache.delete(key));
    docCache.set(key, p);
  }
  return p;
}

export function dropCachedDoc(key: string) {
  const p = docCache.get(key);
  docCache.delete(key);
  if (p) p.then((d: any) => d?.destroy?.()).catch(() => {});
}

export interface RenderResult {
  width: number;
  height: number;
}

export async function renderPage(
  pdf: any,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  opts: { scale: number; rotation?: number; dpr?: number; crop?: { x: number; y: number; w: number; h: number } },
): Promise<RenderResult> {
  const dpr = opts.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const page = await pdf.getPage(pageNumber);
  const rotation = ((page.rotate || 0) + (opts.rotation || 0)) % 360;
  const viewport = page.getViewport({ scale: opts.scale, rotation });

  let vx = 0;
  let vy = 0;
  let vw = viewport.width;
  let vh = viewport.height;
  if (opts.crop) {
    const c = opts.crop;
    vx = c.x * viewport.width;
    vy = c.y * viewport.height;
    vw = c.w * viewport.width;
    vh = c.h * viewport.height;
  }

  canvas.width = Math.max(1, Math.floor(vw * dpr));
  canvas.height = Math.max(1, Math.floor(vh * dpr));
  canvas.style.width = `${Math.floor(vw)}px`;
  canvas.style.height = `${Math.floor(vh)}px`;

  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderViewport = page.getViewport({ scale: opts.scale * dpr, rotation });
  const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;

  await page.render({
    canvasContext: ctx,
    viewport: renderViewport,
    transform,
    // crop offset is handled by a translate transform
  }).promise;

  if (opts.crop && (vx || vy)) {
    // Not used in current layout; crop handled at CSS level.
  }
  return { width: vw, height: vh };
}

/** Extract text content (with positions) for a page — used by search, TTS, AI, OCR overlay. */
export async function getPageText(pdf: any, pageNumber: number) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent({ includeMarkedContent: false });
  const items = content.items as any[];
  const viewport = page.getViewport({ scale: 1 });
  return items
    .map((it) => {
      if (typeof it.str !== "string") return null;
      const tr = it.transform as number[];
      // Convert PDF space (bottom-left) to normalized top-left space.
      const x = tr[4] / viewport.width;
      const y = 1 - tr[5] / viewport.height;
      const w = (it.width || 0) / viewport.width;
      const h = (it.height || 10) / viewport.height;
      return { str: it.str, x, y: y - h, w, h, source: "pdf" as const };
    })
    .filter(Boolean) as { str: string; x: number; y: number; w: number; h: number; source: "pdf" }[];
}

export async function getPageTextString(pdf: any, pageNumber: number): Promise<string> {
  const items = await getPageText(pdf, pageNumber);
  return items.map((i) => i.str).join(" ");
}

export async function renderPageToDataUrl(
  pdf: any,
  pageNumber: number,
  opts: { scale: number; rotation?: number; crop?: { x: number; y: number; w: number; h: number }; type?: string; quality?: number },
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const rotation = ((page.rotate || 0) + (opts.rotation || 0)) % 360;
  const viewport = page.getViewport({ scale: opts.scale, rotation });
  const crop = opts.crop;
  const w = crop ? crop.w * viewport.width : viewport.width;
  const h = crop ? crop.h * viewport.height : viewport.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const offX = crop ? crop.x * viewport.width : 0;
  const offY = crop ? crop.y * viewport.height : 0;
  await page.render({
    canvasContext: ctx,
    viewport,
    transform: offX || offY ? [1, 0, 0, 1, -offX, -offY] : undefined,
  }).promise;
  return canvas.toDataURL(opts.type || "image/png", opts.quality ?? 0.92);
}
