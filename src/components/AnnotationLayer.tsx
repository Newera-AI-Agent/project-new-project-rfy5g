"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Annotation, Rect, ToolId } from "@/lib/types";
import { clamp, cn, haptic, normRect, uid } from "@/lib/utils";
import { getPendingAsset, subscribePendingAsset, type PendingAsset } from "@/lib/assetBus";
import { pushHistory } from "@/hooks/useKeyboardShortcuts";

interface Props {
  docId: string;
  pageIndex: number;
  /** Unzoomed CSS width of the page in px */
  width: number;
  /** Unzoomed CSS height of the page in px */
  height: number;
  zoom: number;
}

type Pt = { x: number; y: number };

const HANDLE = 12;

export default function AnnotationLayer({ docId, pageIndex, width, height, zoom }: Props) {
  const tool = useStore((s) => s.tool);
  const settings = useStore((s) => s.settings);
  const annotations = useStore((s) => s.docs[docId]?.annotations ?? []);
  const selection = useStore((s) => s.selection);
  const addAnnotation = useStore((s) => s.addAnnotation);
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const setSelection = useStore((s) => s.setSelection);
  const setTool = useStore((s) => s.setTool);
  const toast = useStore((s) => s.toast);

  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [pending, setPending] = useState<PendingAsset | null>(null);

  const drag = useRef<{
    mode: "create" | "move" | "resize" | "none";
    start: Pt;
    id?: string;
    base?: Annotation;
    handle?: string;
  } | null>(null);

  const mine = useMemo(
    () => annotations.filter((a) => a.pageIndex === pageIndex),
    [annotations, pageIndex],
  );

  useEffect(() => subscribePendingAsset((a) => setPending(a)), []);

  const px = (v: number) => v * width * zoom;
  const py = (v: number) => v * height * zoom;

  const toNorm = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return {
        x: clamp((clientX - r.left) / r.width, 0, 1),
        y: clamp((clientY - r.top) / r.height, 0, 1),
      };
    },
    [],
  );

  const beginCreate = (p: Pt): Annotation | null => {
    switch (tool) {
      case "highlight":
      case "underline":
      case "strike":
      case "squiggly":
        return {
          id: uid("an"),
          pageIndex,
          kind: tool,
          color: settings.color,
          opacity: tool === "highlight" ? settings.opacity : 1,
          rects: [{ x: p.x, y: p.y, w: 0, h: 0 }],
          z: 0,
        };
      case "rect":
      case "ellipse":
        return {
          id: uid("an"),
          pageIndex,
          kind: tool,
          rect: { x: p.x, y: p.y, w: 0, h: 0 },
          stroke: settings.color,
          fill: settings.fill,
          strokeWidth: settings.strokeWidth,
          opacity: settings.opacity,
          z: 0,
        };
      case "line":
      case "arrow":
        return {
          id: uid("an"),
          pageIndex,
          kind: tool,
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
          stroke: settings.color,
          strokeWidth: settings.strokeWidth,
          opacity: 1,
          z: 0,
        };
      case "draw":
        return {
          id: uid("an"),
          pageIndex,
          kind: "draw",
          color: settings.color,
          strokeWidth: settings.strokeWidth,
          opacity: 1,
          paths: [[{ x: p.x, y: p.y, p: 0.6 }]],
          z: 0,
        };
      case "redact":
        return {
          id: uid("an"),
          pageIndex,
          kind: "redact",
          rects: [{ x: p.x, y: p.y, w: 0, h: 0 }],
          applied: false,
          z: 0,
        };
      default:
        return null;
    }
  };

  const isDrawTool = (t: ToolId) =>
    t === "highlight" ||
    t === "underline" ||
    t === "strike" ||
    t === "squiggly" ||
    t === "rect" ||
    t === "ellipse" ||
    t === "line" ||
    t === "arrow" ||
    t === "draw" ||
    t === "redact";

  // ---- Pointer handlers -------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const p = toNorm(e.clientX, e.clientY);

    // Place a pending image / stamp / signature with a tap.
    if (pending && (tool === "image" || tool === "stamp" || tool === "signature" || tool === "select")) {
      const w = pending.kind === "signature" ? 0.22 : 0.3;
      const h = pending.kind === "signature" ? 0.075 : 0.18;
      pushHistory();
      addAnnotation(docId, {
        id: uid("an"),
        pageIndex,
        kind: pending.kind,
        rect: { x: clamp(p.x - w / 2, 0, 1 - w), y: clamp(p.y - h / 2, 0, 1 - h), w, h },
        src: pending.src,
        rotation: 0,
        opacity: 1,
        label: pending.label,
        z: 0,
      } as Annotation);
      setPending(null);
      haptic(12);
      if (tool === "image" || tool === "stamp" || tool === "signature") setTool("select");
      return;
    }

    if (tool === "note") {
      pushHistory();
      addAnnotation(docId, {
        id: uid("an"),
        pageIndex,
        kind: "note",
        x: p.x,
        y: p.y,
        color: settings.color,
        author: "You",
        body: "",
        replies: [],
        createdAt: Date.now(),
        z: 0,
      });
      haptic(10);
      setTool("select");
      return;
    }

    if (tool === "text") {
      pushHistory();
      addAnnotation(docId, {
        id: uid("an"),
        pageIndex,
        kind: "text",
        x: p.x,
        y: p.y,
        text: "Double-click to edit",
        fontSize: settings.fontSize,
        color: settings.color,
        font: settings.font,
        bold: settings.bold,
        z: 0,
      });
      setTool("select");
      return;
    }

    if (tool === "crop") return; // handled by the crop helper in the page sidebar

    if (isDrawTool(tool)) {
      const created = beginCreate(p);
      if (!created) return;
      drag.current = { mode: "create", start: p };
      setDraft(created);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

    // select tool: pick an annotation under the pointer
    const hit = hitTest(p);
    if (hit) {
      setSelection({ docId, ids: [hit.id] });
      const isMarker = hit.kind === "note" || hit.kind === "text" || hit.kind === "image" || hit.kind === "stamp";
      drag.current = { mode: "move", start: p, id: hit.id, base: hit };
      if (!isMarker) (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else {
      setSelection(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toNorm(e.clientX, e.clientY);

    if (d.mode === "create" && draft) {
      setDraft(extend(draft, d.start, p));
      return;
    }

    if (d.mode === "move" && d.base) {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      d.start = p;
      updateAnnotation(docId, d.base.id, move(d.base, dx, dy));
      d.base = move(d.base, dx, dy);
      return;
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "create" && draft) {
      const ok = hasArea(draft);
      if (ok) {
        pushHistory();
        addAnnotation(docId, draft);
        haptic(10);
      }
      setDraft(null);
      return;
    }
    if (d?.mode === "move") {
      pushHistory();
    }
  };

  const hitTest = (p: Pt): Annotation | null => {
    const pad = 0.01;
    const list = [...mine].sort((a, b) => (b.z || 0) - (a.z || 0));
    for (const a of list) {
      if (a.kind === "note" || a.kind === "text") {
        const w = a.kind === "note" ? 0.03 : 0.16;
        const h = a.kind === "note" ? 0.035 : 0.04;
        if (p.x >= a.x - pad && p.x <= a.x + w + pad && p.y >= a.y - pad && p.y <= a.y + h + pad) return a;
      } else if (a.kind === "image" || a.kind === "stamp") {
        if (inRect(p, a.rect, pad)) return a;
      } else if (a.kind === "rect" || a.kind === "ellipse") {
        if (inRect(p, a.rect, pad)) return a;
      } else if (a.kind === "line" || a.kind === "arrow") {
        if (nearLine(p, a)) return a;
      } else if ("rects" in a) {
        if (a.rects.some((r) => inRect(p, r, pad))) return a;
      } else if (a.kind === "draw") {
        if (a.paths.some((path) => path.some((q) => Math.abs(q.x - p.x) < 0.02 && Math.abs(q.y - p.y) < 0.02))) return a;
      }
    }
    return null;
  };

  const all = draft ? [...mine, draft] : mine;

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "absolute inset-0",
        tool === "select" ? "cursor-default" : "cursor-crosshair",
      )}
      style={{ touchAction: "none" }}
      data-annotation-layer={pageIndex}
    >
      <svg width={px(1)} height={py(1)} className="pointer-events-none absolute inset-0">
        {all.map((a) => (
          <AnnoSvg key={a.id} a={a} width={px(1)} height={py(1)} zoom={zoom} />
        ))}
      </svg>

      {/* Notes / text (HTML so they can be edited & threaded) */}
      {all.map((a) =>
        a.kind === "note" ? (
          <NoteMarker key={a.id} docId={docId} a={a} x={px(a.x)} y={py(a.y)} selected={isSel(selection, docId, a.id)} onSelect={() => setSelection({ docId, ids: [a.id] })} onDelete={() => { pushHistory(); removeAnnotation(docId, a.id); }} onMove={(dx, dy) => updateAnnotation(docId, a.id, { x: clamp(a.x + dx, 0, 1), y: clamp(a.y + dy, 0, 1) })} />
        ) : a.kind === "text" ? (
          <TextBlock key={a.id} docId={docId} a={a} x={px(a.x)} y={py(a.y)} zoom={zoom} selected={isSel(selection, docId, a.id)} onSelect={() => setSelection({ docId, ids: [a.id] })} />
        ) : null,
      )}

      {/* Selection outline + handles */}
      {selection?.docId === docId &&
        selection.ids.map((id) => {
          const a = mine.find((x) => x.id === id);
          if (!a) return null;
          const r = rectOf(a);
          if (!r) return null;
          return (
            <div
              key={id}
              className="pointer-events-none absolute border-2 border-[var(--accent)]"
              style={{ left: px(r.x) - 2, top: py(r.y) - 2, width: px(r.w) + 4, height: py(r.h) + 4, borderRadius: 4 }}
            >
              <span
                className="pointer-events-auto absolute -bottom-2 -right-2 rounded-full bg-[var(--accent)]"
                style={{ width: HANDLE, height: HANDLE }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const p = toNorm(e.clientX, e.clientY);
                  drag.current = { mode: "resize", start: p, id, base: a };
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
              />
            </div>
          );
        })}

      {pending && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-[var(--accent)]/5">
          <span className="mt-3 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white shadow">
            Tap to place {pending.kind}
          </span>
        </div>
      )}

      {all.length === 0 && tool === "select" && <span className="hidden" aria-hidden />}
      {toast ? null : null}
    </div>
  );
}

// -------- helpers --------
function isSel(sel: { docId: string; ids: string[] } | null, docId: string, id: string) {
  return !!sel && sel.docId === docId && sel.ids.includes(id);
}

function inRect(p: Pt, r: Rect, pad = 0) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

function nearLine(p: Pt, a: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy) || 1;
  const t = clamp(((p.x - a.x1) * dx + (p.y - a.y1) * dy) / (len * len), 0, 1);
  const cx = a.x1 + t * dx;
  const cy = a.y1 + t * dy;
  return Math.hypot(p.x - cx, p.y - cy) < 0.02;
}

function rectOf(a: Annotation): Rect | null {
  if (a.kind === "rect" || a.kind === "ellipse" || a.kind === "image" || a.kind === "stamp") return a.rect;
  if (a.kind === "highlight" || a.kind === "underline" || a.kind === "strike" || a.kind === "squiggly" || a.kind === "redact") {
    if (!a.rects.length) return null;
    const x = Math.min(...a.rects.map((r) => r.x));
    const y = Math.min(...a.rects.map((r) => r.y));
    const x2 = Math.max(...a.rects.map((r) => r.x + r.w));
    const y2 = Math.max(...a.rects.map((r) => r.y + r.h));
    return { x, y, w: x2 - x, h: y2 - y };
  }
  if (a.kind === "line" || a.kind === "arrow") {
    const x = Math.min(a.x1, a.x2);
    const y = Math.min(a.y1, a.y2);
    return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  }
  return null;
}

function move(a: Annotation, dx: number, dy: number): Partial<Annotation> {
  const cl = (v: number) => clamp(v, 0, 1);
  if (a.kind === "rect" || a.kind === "ellipse" || a.kind === "image" || a.kind === "stamp") {
    return { rect: { ...a.rect, x: cl(a.rect.x + dx), y: cl(a.rect.y + dy) } } as Partial<Annotation>;
  }
  if (a.kind === "highlight" || a.kind === "underline" || a.kind === "strike" || a.kind === "squiggly" || a.kind === "redact") {
    return { rects: a.rects.map((r) => ({ ...r, x: cl(r.x + dx), y: cl(r.y + dy) })) } as Partial<Annotation>;
  }
  if (a.kind === "line" || a.kind === "arrow") {
    return { x1: cl(a.x1 + dx), y1: cl(a.y1 + dy), x2: cl(a.x2 + dx), y2: cl(a.y2 + dy) } as Partial<Annotation>;
  }
  if (a.kind === "draw") {
    return { paths: a.paths.map((p) => p.map((q) => ({ ...q, x: cl(q.x + dx), y: cl(q.y + dy) }))) } as Partial<Annotation>;
  }
  if (a.kind === "note" || a.kind === "text") {
    return { x: cl(a.x + dx), y: cl(a.y + dy) } as Partial<Annotation>;
  }
  return {};
}

function extend(a: Annotation, s: Pt, p: Pt): Annotation {
  if (a.kind === "highlight" || a.kind === "underline" || a.kind === "strike" || a.kind === "squiggly" || a.kind === "redact") {
    const r = normRect(s.x, s.y, p.x, p.y);
    const rects =
      a.kind === "highlight" && Math.abs(p.y - s.y) > 0.2
        ? splitLines(s, p)
        : [r];
    return { ...a, rects } as Annotation;
  }
  if (a.kind === "rect" || a.kind === "ellipse") {
    return { ...a, rect: normRect(s.x, s.y, p.x, p.y) } as Annotation;
  }
  if (a.kind === "line" || a.kind === "arrow") {
    return { ...a, x2: p.x, y2: p.y } as Annotation;
  }
  if (a.kind === "draw") {
    const last = a.paths[a.paths.length - 1];
    const nxt = [...a.paths.slice(0, -1), [...last, { x: p.x, y: p.y, p: 0.6 }]];
    return { ...a, paths: nxt } as Annotation;
  }
  return a;
}

function splitLines(s: Pt, p: Pt): Rect[] {
  const h = 0.022;
  const x1 = Math.min(s.x, p.x);
  const x2 = Math.max(s.x, p.x);
  const y1 = Math.min(s.y, p.y);
  const y2 = Math.max(s.y, p.y);
  const out: Rect[] = [];
  for (let y = y1; y < y2; y += h) out.push({ x: x1, y, w: x2 - x1, h: h * 0.8 });
  return out.length ? out : [{ x: x1, y: y1, w: x2 - x1, h: h * 0.8 }];
}

function hasArea(a: Annotation) {
  const r = rectOf(a);
  if (a.kind === "line" || a.kind === "arrow") return Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 0.02;
  if (a.kind === "draw") return (a.paths[0] || []).length > 1;
  if (a.kind === "note" || a.kind === "text") return true;
  return !!r && (r.w > 0.008 || r.h > 0.008);
}

export { AnnotationLayer };