"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Signature, Trash2, Type } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog } from "@/lib/dialogs";
import { setPendingAsset } from "@/lib/assetBus";
import { haptic, uid } from "@/lib/utils";

const CURSIVE = [
  { id: "great-vibes", label: "Great Vibes", css: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: "dancing", label: "Dancing", css: "'Lucida Handwriting', 'Comic Sans MS', cursive" },
  { id: "formal", label: "Formal", css: "'Times New Roman', serif" },
  { id: "marker", label: "Marker", css: "'Trebuchet MS', sans-serif" },
];

/**
 * Touch-optimised signature pad + typed cursive signatures that can be saved
 * locally and stamped onto the page (req 22, 23, 24, 37, 51).
 */
export default function SignatureDialog() {
  const { open } = useDialog("signature");
  const signatures = useStore((s) => s.signatures);
  const saveSignature = useStore((s) => s.saveSignature);
  const deleteSignature = useStore((s) => s.deleteSignature);
  const toast = useStore((s) => s.toast);
  const setTool = useStore((s) => s.setTool);

  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [fontId, setFontId] = useState(CURSIVE[0].id);
  const [inkColor, setInkColor] = useState("#0f172a");
  const [thickness, setThickness] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open, mode]);

  if (!open) return null;

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.strokeStyle = inkColor;
    // Pressure where the hardware reports it, width otherwise (stylus support).
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    ctx.lineWidth = thickness * (0.6 + pressure);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.stroke();
    last.current = p;
  }

  function up() {
    if (drawing.current) haptic(8);
    drawing.current = false;
    last.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawnSrc(): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Trim to the ink bounding box so the stamp has no dead space.
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let any = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          any = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!any) return null;
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad);
    maxY = Math.min(height, maxY + pad);
    const out = document.createElement("canvas");
    out.width = maxX - minX;
    out.height = maxY - minY;
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function typedSrc(): string | null {
    const label = typed.trim();
    if (!label) return null;
    const font = CURSIVE.find((f) => f.id === fontId) ?? CURSIVE[0];
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = inkColor;
    ctx.font = `54px ${font.css}`;
    ctx.textBaseline = "middle";
    ctx.fillText(label, 16, 100, canvas.width - 32);
    return canvas.toDataURL("image/png");
  }

  async function use(src: string | null, label: string, remember: boolean) {
    if (!src) {
      toast("Add a signature first", "error");
      return;
    }
    setPendingAsset({ kind: "signature", src, label });
    setTool("signature");
    haptic([10, 30, 10]);
    if (remember) {
      await saveSignature({
        id: uid(),
        kind: mode,
        src,
        label: label || (mode === "draw" ? "Signature" : typed),
        createdAt: Date.now(),
      });
      toast("Signature saved for reuse", "success");
    } else {
      toast("Tap a page to place your signature", "info");
    }
    closeDialog("signature");
  }

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
      onClick={(e) => e.target === e.currentTarget && closeDialog("signature")}
      role="dialog"
      aria-modal="true"
      aria-label="Signatures and initials"
    >
      <div data-dialog-panel className="surface max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line p-4 shadow-2xl animate-slide-up md:max-w-lg md:rounded-2xl md:animate-fade-in">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Signature className="h-4 w-4 text-[var(--accent)]" /> Signatures &amp; initials
        </h2>

        <div className="mb-3 flex gap-2">
          <button data-active={mode === "draw"} onClick={() => setMode("draw")} className="tool-btn flex-1 gap-1.5 rounded-xl border border-line text-sm">
            <PenLine className="h-4 w-4" /> Draw
          </button>
          <button data-active={mode === "type"} onClick={() => setMode("type")} className="tool-btn flex-1 gap-1.5 rounded-xl border border-line text-sm">
            <Type className="h-4 w-4" /> Type
          </button>
        </div>

        {mode === "draw" ? (
          <div>
            <canvas
              ref={canvasRef}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
              onPointerCancel={up}
              className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-line bg-[var(--surface-2)]"
              style={{ touchAction: "none" }}
              aria-label="Signature drawing pad"
            />
            <div className="mt-2 flex items-center gap-3">
              <button onClick={clearCanvas} className="btn-ghost h-9 gap-1.5 px-3 text-xs">
                <Eraser className="h-3.5 w-3.5" /> Clear
              </button>
              <label className="flex items-center gap-1.5 text-xs">
                Ink
                <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="h-7 w-9 rounded border border-line bg-transparent" aria-label="Ink colour" />
              </label>
              <label className="flex flex-1 items-center gap-2 text-xs">
                Width
                <input type="range" min={1} max={8} step={0.5} value={thickness} onChange={(e) => setThickness(parseFloat(e.target.value))} className="flex-1 accent-[var(--accent)]" aria-label="Stroke width" />
              </label>
            </div>
          </div>
        ) : (
          <div>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type your name"
              className="h-11 w-full rounded-lg border border-line bg-[var(--surface-2)] px-3 text-sm"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CURSIVE.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFontId(f.id)}
                  data-active={fontId === f.id}
                  className={`tool-btn h-14 justify-center rounded-xl border border-line px-2 text-xl ${fontId === f.id ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "surface-2"}`}
                  style={{ fontFamily: f.css }}
                >
                  {typed.trim() || f.label}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-1.5 text-xs">
              Ink
              <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="h-7 w-9 rounded border border-line bg-transparent" aria-label="Ink colour" />
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              const label = mode === "draw" ? window.prompt("Name this signature", "Signature") || "Signature" : typed;
              use(mode === "draw" ? drawnSrc() : typedSrc(), label, true);
            }}
            className="btn-ghost h-11 flex-1 gap-1.5 text-sm"
          >
            Save for reuse
          </button>
          <button
            onClick={() => use(mode === "draw" ? drawnSrc() : typedSrc(), mode === "draw" ? "Signature" : typed, false)}
            className="btn-primary h-11 flex-1 gap-1.5 text-sm"
          >
            Place on page
          </button>
        </div>

        {signatures.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold text-soft">Saved signatures</h3>
            <div className="grid grid-cols-2 gap-2">
              {signatures.map((s) => (
                <div key={s.id} className="group relative rounded-xl border border-line bg-[var(--surface-2)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.label} className="mx-auto h-12 w-full object-contain" />
                  <div className="mt-1 flex items-center gap-1">
                    <button onClick={() => use(s.src, s.label, false)} className="btn-primary h-8 flex-1 text-[11px]">
                      Use
                    </button>
                    <button
                      onClick={() => deleteSignature(s.id)}
                      className="tool-btn h-8 w-8 shrink-0"
                      aria-label={`Delete ${s.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-soft">Signatures are stored only in this browser&apos;s local database.</p>
          </div>
        )}
      </div>
    </div>
  );
}