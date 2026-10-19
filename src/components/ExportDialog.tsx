"use client";

import { useMemo, useState } from "react";
import { FileDown, FileText, Image as ImageIcon, Printer, Share2, Sparkles } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog } from "@/lib/dialogs";
import { buildPdf, extractRange } from "@/lib/pdfExport";
import { downloadBlob, formatBytes } from "@/lib/utils";
import { getPdfjs, renderPageToDataUrl, getPageTextString } from "@/lib/pdfEngine";

type Format = "pdf" | "png" | "jpeg" | "svg" | "txt";

/** Export to PDF / PNG / JPEG / SVG / text, plus print & native share (req 19, 31, 46, 49, 50, 54). */
export default function ExportDialog() {
  const { open, payload } = useDialog("export") as { open: boolean; payload: { pageIndex?: number } | null };
  const doc = useStore((s) => (s.activeId ? s.docs[s.activeId] : undefined));
  const toast = useStore((s) => s.toast);
  const setBusy = useStore((s) => s.setBusy);
  const [format, setFormat] = useState<Format>("pdf");
  const [rangeText, setRangeText] = useState("");
  const [flatten, setFlatten] = useState(true);
  const [applyRedactions, setApplyRedactions] = useState(true);
  const [optimize, setOptimize] = useState(true);
  const [progress, setProgress] = useState("");

  const selectedForExport = useMemo(() => {
    const raw = rangeText.trim();
    if (!raw) return null;
    const set = new Set<number>();
    for (const part of raw.split(",")) {
      const p = part.trim();
      if (!p) continue;
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
      if (m) {
        const a = Math.max(1, parseInt(m[1], 10));
        const b = Math.min(doc?.pages.length ?? 0, parseInt(m[2], 10));
        for (let i = a; i <= b; i++) set.add(i - 1);
      } else if (/^\d+$/.test(p)) {
        const n = parseInt(p, 10);
        if (n >= 1 && n <= (doc?.pages.length ?? 0)) set.add(n - 1);
      }
    }
    return set.size ? set : null;
  }, [rangeText, doc?.pages.length]);

  if (!open || !doc) return null;

  const pageCount = selectedForExport ? selectedForExport.size : doc.pages.length;

  async function exportPdf(): Promise<Uint8Array> {
    return buildPdf(doc!, {
      flatten,
      applyRedactions,
      pageFilter: selectedForExport ? [...selectedForExport] : undefined,
    });
  }

  async function run() {
    if (!doc) return;
    setBusy("export");
    try {
      const baseName = doc.name.replace(/\.pdf$/i, "");
      if (format === "txt") {
        const pdf = await getPdfjs().then((p) => p.getDocument({ data: doc.bytes.slice(0) }));
        const parts: string[] = [];
        for (const meta of doc.pages) {
          const wanted = !selectedForExport || selectedForExport.has(doc.pages.indexOf(meta));
          if (!wanted) continue;
          const page = await pdf.getPage(meta.srcIndex + 1);
          parts.push(`— Page ${doc.pages.indexOf(meta) + 1} —\n` + (await getPageTextString(pdf, meta.srcIndex + 1)));
        }
        await pdf.destroy();
        downloadBlob(`${baseName}.txt`, new Blob([parts.join("\n\n")], { type: "text/plain" }));
        toast("Text extracted", "success");
        return;
      }

      if (format === "pdf") {
        const bytes = await exportPdf();
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        const blob = new Blob([ab as BlobPart], { type: "application/pdf" });
        const saved = await maybeShareOrSave(`${baseName}.pdf`, blob, bytes.byteLength);
        toast(saved, "success");
        return;
      }

      // Raster / vector-image export.
      const pdf = await getPdfjs().then((p) => p.getDocument({ data: doc.bytes.slice(0) }));
      const positions = doc.pages.map((_, i) => i).filter((i) => !selectedForExport || selectedForExport.has(i));
      for (let n = 0; n < positions.length; n++) {
        const pos = positions[n];
        setProgress(`Rendering ${n + 1}/${positions.length}…`);
        const meta = doc.pages[pos];
        const url = await renderPageToDataUrl(pdf, meta.srcIndex + 1, {
          scale: 2,
          rotation: meta.rotation,
          crop: meta.crop,
          type: format === "jpeg" ? "image/jpeg" : "image/png",
        });
        if (!url) continue;
        const suffix = String(pos + 1).padStart(String(doc.pages.length).length, "0");
        if (format === "svg") {
          const img = await loadImage(url);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}" viewBox="0 0 ${img.width} ${img.height}"><image href="${url}" width="${img.width}" height="${img.height}"/></svg>`;
          downloadBlob(`${baseName}-page-${suffix}.svg`, new Blob([svg], { type: "image/svg+xml" }));
        } else {
          const bytes = await (await fetch(url)).arrayBuffer();
          downloadBlob(`${baseName}-page-${suffix}.${format === "jpeg" ? "jpg" : "png"}`, new Blob([bytes], { type: format === "jpeg" ? "image/jpeg" : "image/png" }));
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      await pdf.destroy();
      toast(`Exported ${positions.length} page(s) as ${format.toUpperCase()}`, "success");
    } catch (err) {
      console.error(err);
      toast(`Export failed: ${(err as Error).message ?? "unknown error"}`, "error");
    } finally {
      setProgress("");
      setBusy(null);
    }
  }

  async function maybeShareOrSave(name: string, blob: Blob, size: number): Promise<string> {
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    const file = new File([blob], name, { type: blob.type });
    if (nav.canShare?.({ files: [file] }) && (navigator as any).share) {
      try {
        await (navigator as any).share({ files: [file], title: name });
        return "Shared";
      } catch {
        /* user cancelled — fall through to download */
      }
    }
    downloadBlob(name, blob);
    return `Saved ${formatBytes(size)}`;
  }

  const formats: { id: Format; label: string; hint: string }[] = [
    { id: "pdf", label: "PDF", hint: "Flattened & optimised" },
    { id: "png", label: "PNG", hint: "Lossless per page" },
    { id: "jpeg", label: "JPEG", hint: "Smaller, lossy" },
    { id: "svg", label: "SVG", hint: "Wrapped raster" },
    { id: "txt", label: "Text", hint: "Extract text layer" },
  ];

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
      onClick={(e) => e.target === e.currentTarget && closeDialog("export")}
      role="dialog"
      aria-modal="true"
      aria-label="Export document"
    >
      <div data-dialog-panel className="surface max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line p-4 shadow-2xl animate-slide-up md:max-w-md md:rounded-2xl md:animate-fade-in">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <FileDown className="h-4 w-4 text-[var(--accent)]" /> Export &amp; share
        </h2>
        <p className="mb-4 text-xs text-soft">
          {doc.name} · {doc.pages.length} page(s)
          {payload?.pageIndex != null ? ` · starting at page ${payload.pageIndex + 1}` : ""}
        </p>

        <div className="grid grid-cols-5 gap-2">
          {formats.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              data-active={format === f.id}
              title={f.hint}
              className={`tool-btn flex-col gap-0.5 rounded-xl border border-line px-1 py-2 text-[11px] font-semibold ${format === f.id ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "surface-2"}`}
            >
              {f.id === "txt" ? <FileText className="h-4 w-4" /> : f.id === "pdf" ? <Sparkles className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              {f.label}
            </button>
          ))}
        </div>

        {(format === "png" || format === "jpeg" || format === "svg" || format === "txt") && (
          <label className="mt-4 block">
            <span className="text-xs font-medium">Pages (e.g. 1-3, 5)</span>
            <input
              value={rangeText}
              onChange={(e) => setRangeText(e.target.value)}
              placeholder={`all ${doc.pages.length}`}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-[var(--surface-2)] px-3 text-sm"
            />
          </label>
        )}

        {format === "pdf" && (
          <div className="mt-4 space-y-2 rounded-xl border border-line p-3">
            <Toggle label="Flatten annotations into the page" on={flatten} set={setFlatten} />
            <Toggle label="Burn in redactions (remove hidden text)" on={applyRedactions} set={setApplyRedactions} />
            <Toggle label="Optimise object streams" on={optimize} set={setOptimize} />
            <label className="block pt-1">
              <span className="text-xs font-medium">Page range (optional)</span>
              <input
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                placeholder={`all ${doc.pages.length}`}
                className="mt-1 h-10 w-full rounded-lg border border-line bg-[var(--surface-2)] px-3 text-sm"
              />
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={run} className="btn-primary h-11 flex-1 gap-2 text-sm">
            <FileDown className="h-4 w-4" /> Export {pageCount} page(s)
          </button>
          <button
            onClick={() => window.print()}
            className="btn-ghost h-11 gap-1.5 px-3 text-sm"
            title="Print via the browser dialog"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={async () => {
              try {
                const bytes = await extractRange(doc, doc.pages.map((_, i) => i));
                const ab = new ArrayBuffer(bytes.byteLength);
                new Uint8Array(ab).set(bytes);
                maybeShareOrSave(doc.name, new Blob([ab as BlobPart], { type: "application/pdf" }), bytes.byteLength);
              } catch {
                toast("Could not prepare the file to share", "error");
              }
            }}
            className="btn-ghost h-11 gap-1.5 px-3 text-sm"
            title="Share with another app"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        {progress && <p className="mt-3 text-center text-xs text-soft">{progress}</p>}
        <p className="mt-3 text-center text-[11px] text-soft">Processed entirely on this device — nothing is uploaded.</p>
      </div>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
