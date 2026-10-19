"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Annotation, NoteAnno, Rect, TextAnno, ToolId } from "@/lib/types";
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
      const patch = move(d.base, dx, dy);
      updateAnnotation(docId, d.base.id, patch);
      d.base = { ...d.base, ...patch } as Annotation;
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

// ---------------------------------------------------------------------------
// SVG renderer for vector / raster annotations (everything except note & text).
// ---------------------------------------------------------------------------
function AnnoSvg({
  a,
  width,
  height,
  zoom,
}: {
  a: Annotation;
  width: number;
  height: number;
  zoom: number;
}) {
  const px = (v: number) => v * width;
  const py = (v: number) => v * height;
  const sw = (n: number) => Math.max(1, n * zoom);

  if (
    a.kind === "highlight" ||
    a.kind === "underline" ||
    a.kind === "strike" ||
    a.kind === "squiggly" ||
    a.kind === "redact"
  ) {
    return (
      <g>
        {a.rects.map((r, i) => {
          const x = px(r.x);
          const y = py(r.y);
          const w = Math.max(1, px(r.w));
          const h = Math.max(1, py(r.h));
          if (a.kind === "highlight")
            return <rect key={i} x={x} y={y} width={w} height={h} rx={2} fill={a.color} opacity={a.opacity} />;
          if (a.kind === "redact")
            return <rect key={i} x={x} y={y} width={w} height={h} fill="#000000" opacity={a.applied ? 1 : 0.9} />;
          if (a.kind === "squiggly") {
            const step = 5;
            const pts: string[] = [];
            for (let sx = 0; sx <= w; sx += step)
              pts.push(`${sx},${(Math.sin((sx / step) * Math.PI) * 1.5).toFixed(2)}`);
            return (
              <polyline
                key={i}
                points={pts.join(" ")}
                transform={`translate(${x},${y + h * 0.92})`}
                fill="none"
                stroke={a.color}
                strokeWidth={sw(1.6)}
              />
            );
          }
          const yy = a.kind === "strike" ? y + h * 0.55 : y + h * 0.95;
          return (
            <line key={i} x1={x} y1={yy} x2={x + w} y2={yy} stroke={a.color} strokeWidth={sw(2)} />
          );
        })}
      </g>
    );
  }

  if (a.kind === "rect") {
    return (
      <rect
        x={px(a.rect.x)}
        y={py(a.rect.y)}
        width={Math.max(1, px(a.rect.w))}
        height={Math.max(1, py(a.rect.h))}
        rx={3}
        fill={a.fill === "none" ? "none" : a.fill}
        stroke={a.stroke}
        strokeWidth={sw(a.strokeWidth)}
        opacity={a.opacity}
      />
    );
  }

  if (a.kind === "ellipse") {
    return (
      <ellipse
        cx={px(a.rect.x + a.rect.w / 2)}
        cy={py(a.rect.y + a.rect.h / 2)}
        rx={Math.max(1, px(a.rect.w / 2))}
        ry={Math.max(1, py(a.rect.h / 2))}
        fill={a.fill === "none" ? "none" : a.fill}
        stroke={a.stroke}
        strokeWidth={sw(a.strokeWidth)}
        opacity={a.opacity}
      />
    );
  }

  if (a.kind === "line" || a.kind === "arrow") {
    const x1 = px(a.x1);
    const y1 = py(a.y1);
    const x2 = px(a.x2);
    const y2 = py(a.y2);
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={a.stroke} strokeWidth={sw(a.strokeWidth)} opacity={a.opacity} />
        {a.kind === "arrow" && (
          <polygon
            points={`0,0 ${-9 - a.strokeWidth},${-4 - a.strokeWidth / 2} ${-9 - a.strokeWidth},${4 + a.strokeWidth / 2}`}
            transform={`translate(${x2},${y2}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI})`}
            fill={a.stroke}
            opacity={a.opacity}
          />
        )}
      </g>
    );
  }

  if (a.kind === "draw") {
    const d = a.paths
      .map((path) => {
        if (!path.length) return "";
        const head = `M ${px(path[0].x)} ${py(path[0].y)}`;
        const rest = path.slice(1).map((q) => `L ${px(q.x)} ${py(q.y)}`).join(" ");
        return `${head} ${rest}`;
      })
      .join(" ");
    return (
      <path d={d} fill="none" stroke={a.color} strokeWidth={sw(a.strokeWidth)} opacity={a.opacity} strokeLinecap="round" strokeLinejoin="round" />
    );
  }

  if (a.kind !== "image" && a.kind !== "stamp") return null;

  // image | stamp
  const w = Math.max(1, px(a.rect.w));
  const h = Math.max(1, py(a.rect.h));
  return (
    <g opacity={a.opacity} transform={`rotate(${a.rotation || 0} ${px(a.rect.x) + w / 2} ${py(a.rect.y) + h / 2})`}>
      <image href={a.src} x={px(a.rect.x)} y={py(a.rect.y)} width={w} height={h} preserveAspectRatio="none" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sticky-note marker (HTML, so it can host threaded replies).
// ---------------------------------------------------------------------------
function NoteMarker({
  docId,
  a,
  x,
  y,
  selected,
  onSelect,
  onDelete,
  onMove,
}: {
  docId: string;
  a: NoteAnno;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (dx: number, dy: number) => void;
}) {
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(a.body);
  const [reply, setReply] = useState("");
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => setBody(a.body), [a.body]);

  return (
    <div className="absolute" style={{ left: x, top: y, zIndex: 30 }}>
      <button
        aria-label="Open comment"
        className={cn(
          "flex h-6 w-6 -translate-x-1 -translate-y-1 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-md",
          selected && "ring-2 ring-white",
        )}
        style={{ background: a.color }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.startX;
          const dy = e.clientY - d.startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        }}
        onPointerUp={(e) => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d && d.moved) {
            onMove((e.clientX - d.startX) / 1000, (e.clientY - d.startY) / 1000);
            haptic(8);
          } else {
            onSelect();
            setOpen((o) => !o);
          }
        }}
      >
        {a.replies.length + 1}
      </button>

      {open && (
        <div className="absolute left-7 top-0 w-64 rounded-xl border border-line surface p-3 text-sm shadow-2xl">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold">{a.author}</span>
            <button className="text-xs opacity-60 hover:opacity-100" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => updateAnnotation(docId, a.id, { body } as Partial<Annotation>)}
            rows={3}
            placeholder="Add a comment…"
            className="w-full resize-none rounded-lg border border-line bg-transparent p-2 text-sm outline-none"
          />
          {a.replies.map((r) => (
            <div key={r.id} className="mt-2 rounded-lg border border-line p-2 text-xs opacity-80">
              <span className="font-semibold">{r.author}</span> {r.body}
            </div>
          ))}
          <div className="mt-2 flex gap-1">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1.5 text-xs outline-none"
            />
            <button
              className="rounded-lg bg-[var(--accent)] px-2 py-1.5 text-xs font-medium text-white"
              onClick={() => {
                if (!reply.trim()) return;
                updateAnnotation(docId, a.id, {
                  replies: [...a.replies, { id: uid("rep"), author: "You", body: reply.trim(), at: Date.now() }],
                } as Partial<Annotation>);
                setReply("");
              }}
            >
              Reply
            </button>
          </div>
          <div className="mt-2 flex justify-between">
            <button
              className="text-xs opacity-70 hover:opacity-100"
              onClick={() => updateAnnotation(docId, a.id, { resolved: !a.resolved } as Partial<Annotation>)}
            >
              {a.resolved ? "Reopen" : "Resolve"}
            </button>
            <button className="text-xs text-rose-500 hover:underline" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WYSIWYG text block (HTML contenteditable overlay).
// ---------------------------------------------------------------------------
const FONT_FAMILY: Record<TextAnno["font"], string> = {
  Helvetica: "var(--font-sans), Arial, Helvetica, sans-serif",
  TimesRoman: "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

function TextBlock({
  docId,
  a,
  x,
  y,
  zoom,
  selected,
  onSelect,
}: {
  docId: string;
  a: TextAnno;
  x: number;
  y: number;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(a.text);
  useEffect(() => setValue(a.text), [a.text]);

  const commit = () => {
    setEditing(false);
    if (value !== a.text) updateAnnotation(docId, a.id, { text: value } as Partial<Annotation>);
  };

  return (
    <div className="absolute" style={{ left: x, top: y, zIndex: 20, maxWidth: "80%" }}>
      {editing ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          rows={Math.max(1, value.split("\n").length)}
          className="resize-none rounded border border-[var(--accent)] bg-white/95 p-1 leading-tight outline-none"
          style={{
            color: a.color,
            fontSize: a.fontSize * zoom,
            fontFamily: FONT_FAMILY[a.font],
            fontWeight: a.bold ? 700 : 400,
            minWidth: 120,
          }}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onDoubleClick={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !editing) setEditing(true);
          }}
          className={cn(
            "cursor-text whitespace-pre-wrap rounded px-1",
            selected && "ring-2 ring-[var(--accent)]",
          )}
          style={{
            color: a.color,
            fontSize: a.fontSize * zoom,
            fontFamily: FONT_FAMILY[a.font],
            fontWeight: a.bold ? 700 : 400,
          }}
        >
          {a.text || "Text"}
        </div>
      )}
    </div>
  );
}
