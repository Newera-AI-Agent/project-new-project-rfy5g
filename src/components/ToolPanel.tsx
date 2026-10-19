"use client";

import { useStore } from "@/store/useStore";
import { STAMP_TEMPLATES } from "@/lib/utils";

const COLORS = [
  "#facc15",
  "#22c55e",
  "#3b82f6",
  "#ef4444",
  "#a855f7",
  "#f97316",
  "#0ea5e9",
  "#111827",
];

const MARKUP = ["highlight", "underline", "strike", "squiggly"];
const STROKE = ["draw", "rect", "ellipse", "line", "arrow", "redact"];

export default function ToolPanel() {
  const tool = useStore((s) => s.tool);
  const settings = useStore((s) => s.settings);
  const patch = useStore((s) => s.patchSettings);
  const selection = useStore((s) => s.selection);
  const docs = useStore((s) => s.docs);

  const sel = selection?.ids ?? [];
  const selectedAnno = (() => {
    if (!selection) return null;
    for (const d of Object.values(docs)) {
      for (const a of d.annotations) {
        if (selection.ids.includes(a.id)) return a;
      }
    }
    return null;
  })();

  const isMarkup = MARKUP.includes(tool);
  const isStroke = STROKE.includes(tool);
  const isText = tool === "text";
  const isStamp = tool === "stamp";
  const isDraw = tool === "draw";
  const showColor = isMarkup || isStroke || isText || isDraw || isStamp;

  if (tool === "select" && !selectedAnno) {
    return (
      <div className="no-print hidden items-center gap-2 border-t border-line px-3 py-1.5 text-xs text-soft md:flex">
        <span>
          Tool: <b className="font-semibold text-[var(--text)]">Select</b>
        </span>
        <span className="opacity-60">·</span>
        <span>Pick a tool above, or tap content on the page to select it.</span>
      </div>
    );
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-t border-line surface px-2 py-2 sm:gap-3 sm:px-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
        {selectedAnno ? "Selection" : tool}
      </span>

      {showColor && (
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={"Color " + c}
              onClick={() => patch({ color: c, ...(isStamp ? { stampColor: c } : {}) })}
              className={
                "h-6 w-6 rounded-full border transition " +
                ((isStamp ? settings.stampColor : settings.color) === c
                  ? "border-[var(--text)] ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
                  : "border-black/10")
              }
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      {(isMarkup || isStroke) && (
        <label className="flex items-center gap-2 text-xs text-soft">
          Opacity
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.opacity}
            onChange={(e) => patch({ opacity: Number(e.target.value) })}
            className="h-1 w-20 accent-[var(--accent)]"
          />
        </label>
      )}

      {(isDraw || tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow") && (
        <label className="flex items-center gap-2 text-xs text-soft">
          Width
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={settings.strokeWidth}
            onChange={(e) => patch({ strokeWidth: Number(e.target.value) })}
            className="h-1 w-20 accent-[var(--accent)]"
          />
        </label>
      )}

      {isText && (
        <>
          <label className="flex items-center gap-2 text-xs text-soft">
            Size
            <input
              type="number"
              min={6}
              max={96}
              value={settings.fontSize}
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
              className="w-16 rounded-md border border-line surface-2 px-2 py-1 text-xs"
            />
          </label>
          <select
            value={settings.font}
            onChange={(e) => patch({ font: e.target.value as any })}
            className="rounded-md border border-line surface-2 px-2 py-1 text-xs"
            aria-label="Font"
          >
            <option value="Helvetica">Helvetica</option>
            <option value="TimesRoman">Times</option>
            <option value="Courier">Courier</option>
          </select>
          <button className="tool-btn h-8 px-2 text-xs" data-active={settings.bold} onClick={() => patch({ bold: !settings.bold })}>
            B
          </button>
        </>
      )}

      {isStamp && (
        <>
          <input
            value={settings.stampText}
            onChange={(e) => patch({ stampText: e.target.value })}
            placeholder="Stamp text"
            className="w-28 rounded-md border border-line surface-2 px-2 py-1 text-xs"
          />
          <div className="flex items-center gap-1">
            {STAMP_TEMPLATES.slice(0, 5).map((t) => (
              <button key={t} className="tool-btn h-8 px-2 text-xs" onClick={() => patch({ stampText: t })}>
                {t}
              </button>
            ))}
          </div>
        </>
      )}

      {sel.length > 1 && <span className="text-xs text-soft">{sel.length} selected</span>}
    </div>
  );
}
