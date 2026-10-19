"use client";

import { useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useDialog, closeDialog } from "@/lib/dialogs";
import { useStore } from "@/store/useStore";
import { watermarkBytes, compressBytes, type WatermarkOptions } from "@/lib/batch";
import { buildPdf, mergeDocs } from "@/lib/pdfExport";
import { downloadBlob, formatBytes, hexToRgb } from "@/lib/utils";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#0f172a"];

/** Batch processing across every open document (req 4). */
export default function BatchDialog() {
  const { open } = useDialog("batch");
  const docs = useStore((s) => s.docs);
  const order = useStore((s) => s.order);
  const setBusy = useStore((s) => s.setBusy);
  const toast = useStore((s) => s.toast);
  const closeAll = useStore((s) => s.closeAll);
  const deletePages = useStore((s) => s.deletePages);

  const [selected, setSelected] = useState<string[]>([]);
  const [mark, setMark] = useState("CONFIDENTIAL");
  const [color, setColor] = useState(COLORS[0]);
  const [opacity, setOpacity] = useState(0.18);
  const [quality, setQuality] = useState(0.7);
  const [working, setWorking] = useState(false);
  const [delRange, setDelRange] = useState("");

  useEffect(() => {
    if (open) setSelected(order);
  }, [open, order]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog("batch");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const allChecked = selected.length === order.length && order.length > 0;
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** Run an async transform on every selected doc, saving each result locally. */
  const runEach = async (
    label: string,
    transform: (id: string) => Promise<ArrayBuffer | Uint8Array>,
  ) => {
    if (!selected.length) {
      toast("Select at least one document", "error");
      return;
    }
    setWorking(true);
    setBusy(label);
    try {
      for (const id of selected) {
        const d = docs[id];
        if (!d) continue;
        const bytes = await transform(id);
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const base = d.name.replace(/\.pdf$/i, "");
        downloadBlob(`${base}-${label.replace(/\s+/g, "-").toLowerCase()}.pdf`, blob);
      }
      toast(`${label} → ${selected.length} document(s)`, "success");
    } catch (err) {
      console.error(err);
      toast(`${label} failed: ${(err as Error).message}`, "error");
    } finally {
      setWorking(false);
      setBusy(null);
    }
  };

  const doWatermark = () => {
    const opts: WatermarkOptions = {
      text: mark.trim() || "CONFIDENTIAL",
      color: hexToRgb(color),
      opacity,
      size: 46,
      diagonal: true,
    };
    void runEach("Watermark", (id) => watermarkBytes(docs[id], opts));
  };

  const doCompress = () => void runEach("Compressed", (id) => compressBytes(docs[id], quality));

  const doMerge = async () => {
    if (selected.length < 2) {
      toast("Select at least two documents to merge", "error");
      return;
    }
    setWorking(true);
    setBusy("Merging");
    try {
      const out = await mergeDocs(selected.map((id) => docs[id]).filter(Boolean));
      downloadBlob("merged.pdf", new Blob([out as BlobPart], { type: "application/pdf" }));
      toast(`Merged ${selected.length} documents`, "success");
    } catch (err) {
      toast(`Merge failed: ${(err as Error).message}`, "error");
    } finally {
      setWorking(false);
      setBusy(null);
    }
  };

  const doExportAll = async () => {
    setWorking(true);
    setBusy("Exporting");
    try {
      for (const id of selected) {
        const d = docs[id];
        if (!d) continue;
        const out = await buildPdf(d, { applyRedactions: true });
        downloadBlob(d.name, new Blob([out as BlobPart], { type: "application/pdf" }));
      }
      toast(`Exported ${selected.length} document(s)`, "success");
    } catch (err) {
      toast(`Export failed: ${(err as Error).message}`, "error");
    } finally {
      setWorking(false);
      setBusy(null);
    }
  };

  const doDeletePages = () => {
    const nums = delRange
      .split(/[,\s]+/)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => n - 1);
    if (!nums.length) {
      toast("Enter page numbers, e.g. 2, 5, 7", "error");
      return;
    }
    let count = 0;
    for (const id of selected) {
      const d = docs[id];
      if (!d) continue;
      const valid = nums.filter((n) => n < d.pages.length);
      if (valid.length) count++;
      deletePages(id, valid);
    }
    toast(count ? `Deleted pages from ${count} document(s)` : "No matching pages", count ? "success" : "error");
    setDelRange("");
  };

  const totalSize = selected.reduce((n, id) => n + (docs[id]?.size ?? 0), 0);

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Batch processing"
      onClick={(e) => e.target === e.currentTarget && closeDialog("batch")}
    >
      <div
        data-dialog-panel
        className="surface max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line p-4 shadow-2xl animate-slide-up md:max-w-lg md:rounded-2xl md:animate-fade-in"
      >
        <header className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="flex-1 text-sm font-semibold">Batch processing</h2>
          <button onClick={() => closeDialog("batch")} className="tool-btn h-8 w-8" aria-label="Close">
            ✕
          </button>
        </header>

        <section className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-soft">
              Documents ({selected.length}/{order.length})
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(allChecked ? [] : order)}
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                {allChecked ? "Clear" : "Select all"}
              </button>
              <button onClick={() => closeAll()} className="text-[11px] text-soft hover:underline">
                Close all
              </button>
            </div>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
            {order.length === 0 && <li className="px-2 py-3 text-center text-xs text-soft">No open documents</li>}
            {order.map((id) => {
              const d = docs[id];
              if (!d) return null;
              return (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--surface-2)]">
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() => toggle(id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="shrink-0 text-[10px] text-soft">
                      {d.pageCount}p · {formatBytes(d.size)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <p className="mt-1 text-[10px] text-soft">Total selected size: {formatBytes(totalSize)}</p>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Watermark */}
          <section className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-xs font-semibold">Watermark</h3>
            <input
              value={mark}
              onChange={(e) => setMark(e.target.value)}
              placeholder="Text"
              className="mb-2 h-9 w-full rounded-lg border border-line bg-[var(--surface-2)] px-2 text-sm"
            />
            <div className="mb-2 flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full border ${color === c ? "ring-2 ring-[var(--accent)]" : "border-line"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <label className="mb-2 block text-[10px] text-soft">
              Opacity {Math.round(opacity * 100)}%
              <input
                type="range"
                min={0.05}
                max={0.6}
                step={0.01}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
            <button onClick={doWatermark} disabled={working} className="btn-primary h-9 w-full text-xs">
              Apply watermark
            </button>
          </section>

          {/* Compress */}
          <section className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-xs font-semibold">Compress</h3>
            <label className="mb-3 block text-[10px] text-soft">
              JPEG quality {Math.round(quality * 100)}%
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
            <button onClick={doCompress} disabled={working} className="btn-primary h-9 w-full text-xs">
              Shrink files
            </button>
          </section>

          {/* Delete pages */}
          <section className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-xs font-semibold">Delete pages</h3>
            <input
              value={delRange}
              onChange={(e) => setDelRange(e.target.value)}
              placeholder="2, 5, 7"
              className="mb-2 h-9 w-full rounded-lg border border-line bg-[var(--surface-2)] px-2 text-sm"
            />
            <button onClick={doDeletePages} className="btn-ghost h-9 w-full border border-line text-xs">
              Delete in selection
            </button>
          </section>

          {/* Merge */}
          <section className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-xs font-semibold">Combine</h3>
            <button onClick={doMerge} disabled={working} className="btn-primary mb-2 h-9 w-full text-xs">
              Merge into one PDF
            </button>
            <button onClick={doExportAll} disabled={working} className="btn-ghost h-9 w-full border border-line text-xs">
              Export each (redactions applied)
            </button>
          </section>
        </div>

        {working && (
          <p className="mt-3 flex items-center gap-2 text-xs text-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working locally… nothing leaves your device.
          </p>
        )}
      </div>
    </div>
  );
}