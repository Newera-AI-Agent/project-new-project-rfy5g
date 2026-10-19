"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  FileOutput,
  PlusSquare,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { renderPageToDataUrl, getPdfjs } from "@/lib/pdfEngine";
import { extractRange } from "@/lib/pdfExport";
import { loadBytesToDoc } from "@/lib/loader";
import { pushHistory } from "@/hooks/useKeyboardShortcuts";
import { haptic } from "@/lib/utils";
import type { PageMeta } from "@/lib/types";

function blankThumb(page: PageMeta): string {
  const w = page.width ?? 612;
  const h = page.height ?? 792;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="#ffffff" stroke="#e2e8f0"/></svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

export default function PageSidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const setSidebar = useStore((s) => s.setSidebar);
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => (s.activeId ? s.docs[s.activeId] : undefined));
  const setPageOrder = useStore((s) => s.setPageOrder);
  const rotatePages = useStore((s) => s.rotatePages);
  const deletePages = useStore((s) => s.deletePages);
  const insertBlank = useStore((s) => s.insertBlank);
  const addDoc = useStore((s) => s.addDoc);
  const toast = useStore((s) => s.toast);
  const setBusy = useStore((s) => s.setBusy);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    setSelected(new Set());
  }, [activeId]);

  if (!open || !doc) return null;

  const toggleSel = (i: number, additive: boolean) => {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<number>();
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const onDrop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    pushHistory();
    const pages = doc.pages.slice();
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    setPageOrder(doc.id, pages);
    haptic(12);
  };

  const selArr = () => (selected.size ? Array.from(selected).sort((a, b) => a - b) : []);

  const rotate = (delta: number) => {
    const positions = selArr();
    if (!positions.length) return;
    pushHistory();
    rotatePages(doc.id, positions, delta);
    haptic(8);
  };

  const remove = () => {
    const positions = selArr();
    if (!positions.length) return;
    if (positions.length >= doc.pages.length) {
      toast("Cannot delete every page", "error");
      return;
    }
    if (!window.confirm("Delete " + positions.length + " page(s)?")) return;
    pushHistory();
    deletePages(doc.id, positions);
    setSelected(new Set());
    haptic(15);
  };

  const extract = async () => {
    const positions = selArr();
    if (!positions.length) return;
    setBusy("Extracting pages…");
    try {
      const bytes = await extractRange(
        { id: doc.id, name: doc.name, bytes: doc.bytes, pages: doc.pages } as any,
        positions,
      );
      const { doc: newDoc } = await loadBytesToDoc(
        doc.name.replace(/\.pdf$/i, "") + "-extract.pdf",
        bytes,
      );
      addDoc(newDoc);
      toast("Extracted " + positions.length + " page(s) into a new tab", "success");
    } catch {
      toast("Extraction failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const addBlank = () => {
    pushHistory();
    const at = selected.size ? Math.min(...selected) : doc.pages.length;
    insertBlank(doc.id, at);
    haptic(10);
  };

  return (
    <aside className="no-print absolute inset-y-0 left-0 z-30 flex w-[68vw] max-w-[260px] flex-col border-r border-line surface md:relative md:z-0 md:w-[168px] md:max-w-none lg:w-[196px]">
      <div className="flex h-10 items-center justify-between gap-1 border-b border-line px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-soft">
          Pages · {doc.pages.length}
        </span>
        <button className="tool-btn h-8 w-8 md:hidden" aria-label="Close" onClick={() => setSidebar(false)}>
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {doc.pages.map((p, i) => (
          <Thumb
            key={p.id}
            docId={doc.id}
            page={p}
            index={i}
            selected={selected.has(i)}
            onSelect={(additive) => toggleSel(i, additive)}
            onDragStart={() => (dragFrom.current = i)}
            onDropOn={() => onDrop(i)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-line p-1.5">
        <button className="tool-btn h-9 flex-1" onClick={() => rotate(-90)} aria-label="Rotate left" disabled={!selected.size}>
          <RotateCcw size={16} />
        </button>
        <button className="tool-btn h-9 flex-1" onClick={() => rotate(90)} aria-label="Rotate right" disabled={!selected.size}>
          <RotateCw size={16} />
        </button>
        <button className="tool-btn h-9 flex-1" onClick={extract} aria-label="Extract" disabled={!selected.size}>
          <FileOutput size={16} />
        </button>
        <button className="tool-btn h-9 flex-1" onClick={addBlank} aria-label="Insert blank page">
          <PlusSquare size={16} />
        </button>
        <button className="tool-btn h-9 flex-1 text-rose-500" onClick={remove} aria-label="Delete" disabled={!selected.size}>
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}

function Thumb({
  docId,
  page,
  index,
  selected,
  onSelect,
  onDragStart,
  onDropOn,
}: {
  docId: string;
  page: PageMeta;
  index: number;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (page.blank) {
        setSrc(blankThumb(page));
        return;
      }
      try {
        const d = useStore.getState().docs[docId];
        if (!d) return;
        const pdfjs = await getPdfjs();
        const pdf = await pdfjs.getDocument({ data: d.bytes.slice(0) }).promise;
        if (cancelled) return;
        const url = await renderPageToDataUrl(pdf, page.srcIndex + 1, {
          scale: 0.3,
          rotation: page.rotation,
          crop: page.crop,
          type: "image/png",
        });
        pdf.destroy();
        if (!cancelled) setSrc(url);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, page.id, page.rotation, page.crop?.x, page.crop?.y, page.crop?.w, page.crop?.h, page.blank]);

  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropOn();
      }}
      onClick={(e) => onSelect(e.shiftKey || e.metaKey || e.ctrlKey)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(true);
      }}
      className={
        "group relative flex flex-col items-center gap-1 rounded-lg border p-1.5 transition " +
        (selected
          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : "border-line surface hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]") +
        (over ? " ring-2 ring-[var(--accent)]" : "")
      }
      aria-label={"Page " + (index + 1)}
    >
      <span className="absolute -left-1 -top-1 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
        {index + 1}
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={"Page " + (index + 1)} className="w-full rounded" draggable={false} />
      ) : (
        <span className="block aspect-[3/4] w-full animate-pulse rounded bg-current/5" />
      )}
      {selected && (
        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-white">
          <Copy size={11} />
        </span>
      )}
    </button>
  );
}
