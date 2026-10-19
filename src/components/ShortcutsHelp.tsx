"use client";

import { useEffect } from "react";
import { Keyboard } from "lucide-react";
import { useDialog, closeDialog } from "@/lib/dialogs";

type Row = { keys: string[]; label: string };
type Group = { title: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    title: "General",
    rows: [
      { keys: ["Ctrl", "O"], label: "Open PDF file(s)" },
      { keys: ["Ctrl", "S"], label: "Export / Save" },
      { keys: ["Ctrl", "P"], label: "Print (native dialog)" },
      { keys: ["Ctrl", "F"], label: "Search across documents" },
      { keys: ["?"], label: "Show this shortcut sheet" },
      { keys: ["Esc"], label: "Close panel · deselect · reset tool" },
    ],
  },
  {
    title: "History & clipboard",
    rows: [
      { keys: ["Ctrl", "Z"], label: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], label: "Redo" },
      { keys: ["Ctrl", "Y"], label: "Redo (alt)" },
      { keys: ["Ctrl", "C"], label: "Copy selected annotations" },
      { keys: ["Ctrl", "V"], label: "Paste annotations" },
      { keys: ["Del"], label: "Delete selection" },
    ],
  },
  {
    title: "View & zoom",
    rows: [
      { keys: ["Ctrl", "0"], label: "Reset zoom to 100%" },
      { keys: ["Ctrl", "+"], label: "Zoom in" },
      { keys: ["Ctrl", "-"], label: "Zoom out" },
      { keys: ["G"], label: "Toggle page grid view" },
    ],
  },
  {
    title: "Tools",
    rows: [
      { keys: ["V"], label: "Select / move" },
      { keys: ["T"], label: "Text box" },
      { keys: ["H"], label: "Highlight" },
      { keys: ["U"], label: "Underline" },
      { keys: ["D"], label: "Freehand draw" },
      { keys: ["R"], label: "Rectangle" },
      { keys: ["E"], label: "Ellipse" },
      { keys: ["N"], label: "Sticky note" },
      { keys: ["S"], label: "Signature" },
    ],
  },
];

/** Keyboard shortcut reference (req 36). PC power-user surface. */
export default function ShortcutsHelp() {
  const { open } = useDialog("shortcuts");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog("shortcuts");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => e.target === e.currentTarget && closeDialog("shortcuts")}
    >
      <div
        data-dialog-panel
        className="surface max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line p-4 shadow-2xl animate-slide-up md:max-w-2xl md:rounded-2xl md:animate-fade-in"
      >
        <header className="mb-3 flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="flex-1 text-sm font-semibold">Keyboard shortcuts</h2>
          <button onClick={() => closeDialog("shortcuts")} className="tool-btn h-8 w-8" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-soft">{g.title}</h3>
              <ul className="space-y-1">
                {g.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--surface-2)]">
                    <span>{r.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {r.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="rounded-md border border-line bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-soft"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-soft">
          Tip: on touch devices use the bottom sheet to switch tools. Pinch with two fingers to zoom, drag with one to pan.
        </p>
      </div>
    </div>
  );
}