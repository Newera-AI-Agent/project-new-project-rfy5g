"use client";

import { useEffect, useState } from "react";
import {
  MousePointer2,
  Type,
  Highlighter,
  PenLine,
  Shapes,
  StickyNote,
  Signature,
  Image as ImageIcon,
  Stamp,
  SquarePen,
  ChevronUp,
  SunMoon,
  Rows3,
  Columns3,
  Square,
  Search,
  FileDown,
  Layers,
  ListTree,
  Sparkles,
  Keyboard,
  Grip,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { openDialog } from "@/lib/dialogs";
import { haptic } from "@/lib/utils";
import type { ToolId } from "@/lib/types";

interface ToolDef {
  id: ToolId;
  label: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", Icon: MousePointer2 },
  { id: "text", label: "Text", Icon: Type },
  { id: "highlight", label: "Highlight", Icon: Highlighter },
  { id: "draw", label: "Draw", Icon: PenLine },
  { id: "rect", label: "Shape", Icon: Shapes },
  { id: "note", label: "Note", Icon: StickyNote },
  { id: "signature", label: "Sign", Icon: Signature },
  { id: "image", label: "Image", Icon: ImageIcon },
  { id: "stamp", label: "Stamp", Icon: Stamp },
  { id: "redact", label: "Redact", Icon: SquarePen },
];

const SCROLL_MODES = [
  { id: "vertical", label: "Vertical", Icon: Rows3 },
  { id: "horizontal", label: "Horizontal", Icon: Columns3 },
  { id: "single", label: "Single page", Icon: Square },
] as const;

/**
 * Mobile bottom sheet (req 32/33). Self-managed open state, rendered only on
 * small screens. The persistent thumb-bar gives one-tap tool access; the
 * expandable sheet holds tools, view modes and secondary panels.
 */
export default function MobileSheet() {
  const [open, setOpen] = useState(false);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const scrollMode = useStore((s) => s.scrollMode);
  const setScrollMode = useStore((s) => s.setScrollMode);
  const setGridView = useStore((s) => s.setGridView);
  const hasDoc = useStore((s) => s.order.length > 0);

  // Close the sheet when the viewport grows to desktop width.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const cycleTheme = () => {
    haptic(10);
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "sepia" : "light");
  };

  const pickTool = (id: ToolId) => {
    haptic(10);
    setTool(id);
  };

  const jump = (name: Parameters<typeof openDialog>[0]) => {
    haptic(10);
    setOpen(false);
    openDialog(name, true);
  };

  return (
    <div className="no-print md:hidden">
      {/* Backdrop for the expanded sheet */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Expanded sheet */}
      {open && (
        <section
          data-dialog-panel
          role="dialog"
          aria-modal="true"
          aria-label="Tools"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-line surface p-3 pb-6 shadow-2xl animate-slide-up"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--line)]" />

          <div className="mb-3 grid grid-cols-5 gap-2">
            {TOOLS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => pickTool(id)}
                data-active={tool === id}
                className="flex flex-col items-center gap-1 rounded-xl border border-line bg-[var(--surface-2)] px-1 py-2.5 text-[10px] active:scale-95"
                aria-label={label}
              >
                <Icon size={20} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-soft">Scroll mode</h3>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {SCROLL_MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  haptic(10);
                  setScrollMode(id);
                }}
                data-active={scrollMode === id}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95"
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-soft">Panels</h3>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => jump("search")} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <Search size={16} /> Search
            </button>
            <button onClick={() => jump("outline")} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <ListTree size={16} /> Outline
            </button>
            <button onClick={() => jump("fields")} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <Grip size={16} /> Forms
            </button>
            <button onClick={() => jump("ai")} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <Sparkles size={16} /> AI
            </button>
            <button onClick={() => jump("batch")} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <Layers size={16} /> Batch
            </button>
            <button onClick={() => jump("export")} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <FileDown size={16} /> Export
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={cycleTheme} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] capitalize active:scale-95">
              <SunMoon size={16} /> {theme}
            </button>
            <button
              onClick={() => {
                haptic(10);
                setOpen(false);
                setGridView(true);
              }}
              disabled={!hasDoc}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95 disabled:opacity-50"
            >
              <Grip size={16} /> Page grid
            </button>
            <button onClick={() => jump("shortcuts")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-[var(--surface-2)] py-2.5 text-[11px] active:scale-95">
              <Keyboard size={16} /> Keys
            </button>
          </div>
        </section>
      )}

      {/* Persistent quick bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line surface pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            onClick={() => {
              haptic(10);
              setOpen((v) => !v);
            }}
            className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-[11px] font-medium"
            aria-expanded={open}
            aria-label="Toggle tool sheet"
          >
            <ChevronUp size={18} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            {open ? "Hide" : "Tools"}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
            {TOOLS.slice(0, 7).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => pickTool(id)}
                data-active={tool === id}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:scale-95"
                aria-label={label}
              >
                <Icon size={20} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
