"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import AnnotationLayer from "@/components/AnnotationLayer";
import { renderPage } from "@/lib/pdfEngine";
import type { PdfDoc } from "@/lib/types";

interface Props {
  docId: string;
  split?: boolean;
}

export default function PdfViewport({ docId, split }: Props) {
  const doc = useStore((s) => s.docs[docId]);
  const zoom = useStore((s) => s.zoom[docId] ?? 1);
  const setZoom = useStore((s) => s.setZoom);
  const scrollMode = useStore((s) => s.scrollMode);
  const tool = useStore((s) => s.tool);
  const setActive = useStore((s) => s.setActive);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const pinching = useRef(false);
  const pinchStart = useRef({ dist: 0, zoom: 1 });

  // restore scroll
  useEffect(() => {
    const y = useStore.getState().scrollPos[docId] ?? 0;
    const el = scrollerRef.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = y));
  }, [docId]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    useStore.getState().setScrollPos(docId, el.scrollTop);
    // determine current page
    const pages = Array.from(el.querySelectorAll("[data-page-wrap]")) as HTMLElement[];
    for (let i = 0; i < pages.length; i++) {
      const r = pages[i].getBoundingClientRect();
      if (r.top <= 120 && r.bottom > 120) {
        setCurrentPage(i);
        break;
      }
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { page: number };
      if (useStore.getState().activeId !== docId) return;
      const el = scrollerRef.current;
      if (!el) return;
      const target = el.querySelector(`[data-page-index="${detail.page}"]`) as HTMLElement | null;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(detail.page);
    };
    window.addEventListener("pdfeditz-goto", handler);
    return () => window.removeEventListener("pdfeditz-goto", handler);
  }, [docId]);

  // Pinch-to-zoom (R34) + ctrl-wheel
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching.current = true;
        pinchStart.current = { dist: dist(e.touches), zoom };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinching.current && e.touches.length === 2) {
        const ratio = dist(e.touches) / pinchStart.current.dist;
        setZoom(docId, pinchStart.current.zoom * ratio);
      }
    };
    const onTouchEnd = () => {
      pinching.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(docId, zoom * (e.deltaY < 0 ? 1.1 : 0.9));
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [docId, zoom, setZoom]);

  if (!doc) return null;

  return (
    <div
      className={
        "relative flex min-h-0 min-w-0 flex-1 flex-col " + (split ? "border-t border-line md:border-l md:border-t-0" : "")
      }
      onPointerDown={() => !split && setActive(docId)}
    >
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className={
          "min-h-0 flex-1 overflow-auto bg-[var(--page-bg)] " +
          (scrollMode === "vertical" ? "flex flex-col items-center gap-4 p-3 sm:p-6" : "")
        }
        style={
          scrollMode === "horizontal"
            ? { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 12, overflowX: "auto", overflowY: "auto" }
            : undefined
        }
      >
        {doc.pages.map((p, i) =>
          scrollMode === "single" && i !== currentPage ? null : (
            <PageView key={p.id} doc={doc} index={i} zoom={zoom} />
          ),
        )}
      </div>

      {/* floating zoom + page indicator */}
      <div className="no-print pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line surface px-1.5 py-1 shadow-lg">
          <button className="tool-btn h-8 w-8 text-lg leading-none" onClick={() => setZoom(docId, zoom - 0.15)} aria-label="Zoom out">
            −
          </button>
          <button
            className="min-w-[52px] rounded-full px-2 py-1 text-xs font-semibold tabular-nums"
            onClick={() => setZoom(docId, 1)}
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button className="tool-btn h-8 w-8 text-lg leading-none" onClick={() => setZoom(docId, zoom + 0.15)} aria-label="Zoom in">
            +
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--line)]" />
          <span className="px-2 text-xs font-medium tabular-nums text-soft">
            {currentPage + 1}/{doc.pages.length}
          </span>
        </div>
      </div>
      {tool !== "select" && (
        <div className="no-print pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-line surface px-3 py-1.5 text-xs font-medium shadow">
          {tool === "draw" ? "Draw" : tool === "text" ? "Click to place text" : tool} · {split ? "split" : "active"}
        </div>
      )}
    </div>
  );
}

function PageView({ doc, index, zoom }: { doc: PdfDoc; index: number; zoom: number }) {
  const meta = doc.pages[index];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: meta.width || 612, h: meta.height || 792 });
  const [rendered, setRendered] = useState(false);
  const renderTask = useRef<any>(null);

  const rotated = meta.rotation % 180 !== 0;
  const baseW = rotated ? meta.height : meta.width;
  const baseH = rotated ? meta.width : meta.height;
  const cssW = (meta.crop ? baseW * meta.crop.w : baseW) || baseW;
  const cssH = (meta.crop ? baseH * meta.crop.h : baseH) || baseH;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (meta.blank) {
        // draw a blank page
        const c = canvasRef.current;
        if (!c) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = baseW * zoom * dpr;
        c.height = baseH * zoom * dpr;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
        }
        setSize({ w: baseW, h: baseH });
        setRendered(true);
        return;
      }
      try {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const { pdf, page } = await renderPage(doc.bytes.slice(0), meta.srcIndex + 1, {
          scale: zoom * dpr,
          rotation: meta.rotation,
          canvas: canvasRef.current!,
          crop: meta.crop ? { x: meta.crop.x, y: meta.crop.y, w: meta.crop.w, h: meta.crop.h } : undefined,
        });
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        const vp = page.getViewport({ scale: 1, rotation: meta.rotation });
        setSize({ w: vp.width, h: vp.height });
        setRendered(true);
        await pdf.destroy();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      try {
        renderTask.current?.cancel?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, meta.id, meta.rotation, zoom, meta.crop?.x, meta.crop?.y, meta.crop?.w, meta.crop?.h]);

  return (
    <div
      ref={wrapRef}
      data-page-wrap
      data-page-index={index}
      className="relative shrink-0 pdf-page-shadow"
      style={{
        width: cssW * zoom,
        height: cssH * zoom,
        background: "#fff",
        overflow: meta.crop ? "hidden" : "visible",
      }}
    >
      {!rendered && (
        <div className="absolute inset-0 animate-pulse bg-black/5" />
      )}
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: cssW * zoom, height: cssH * zoom }}
      />
      <AnnotationLayer docId={doc.id} pageIndex={index} width={cssW} height={cssH} zoom={zoom} />
      <span className="no-print absolute -top-0 left-0 -translate-y-full pb-1 text-[10px] font-medium text-soft">
        {index + 1}
      </span>
    </div>
  );
}