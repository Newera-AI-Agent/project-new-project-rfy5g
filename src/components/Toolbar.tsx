"use client";

import { useCallback, useRef, useState } from "react";
import {
  ChevronDown,
  Columns2,
  FileDown,
  FilePlus2,
  Grid3x3,
  Highlighter,
  Image as ImageIcon,
  Languages,
  Layers2,
  ListOrdered,
  Menu,
  MousePointer2,
  PenLine,
  Printer,
  Redo2,
  Search,
  Settings2,
  Shapes,
  Signature,
  Sparkles,
  Stamp,
  SquarePen,
  StickyNote,
  SunMoon,
  Type,
  Undo2,
  Wand2,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { openDialog } from "@/lib/dialogs";
import { undo, redo } from "@/hooks/useKeyboardShortcuts";
import { openPdfFiles } from "@/lib/fileOpen";
import { loadBytesToDoc, addRecent } from "@/lib/loader";
import type { ToolId } from "@/lib/types";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  key?: string;
}

const PRIMARY_TOOLS: ToolDef[] = [
  { id: "select", label: "Select", icon: MousePointer2, key: "V" },
  { id: "text", label: "Text", icon: Type, key: "T" },
  { id: "highlight", label: "Highlight", icon: Highlighter, key: "H" },
  { id: "draw", label: "Draw", icon: PenLine, key: "D" },
  { id: "rect", label: "Shape", icon: Shapes, key: "R" },
  { id: "note", label: "Note", icon: StickyNote, key: "N" },
  { id: "signature", label: "Sign", icon: Signature, key: "S" },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "stamp", label: "Stamp", icon: Stamp },
  { id: "redact", label: "Redact", icon: SquarePen },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const scrollMode = useStore((s) => s.scrollMode);
  const setScrollMode = useStore((s) => s.setScrollMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebar = useStore((s) => s.setSidebar);
  const setGridView = useStore((s) => s.setGridView);
  const setSplit = useStore((s) => s.setSplit);
  const splitId = useStore((s) => s.splitId);
  const order = useStore((s) => s.order);
  const activeId = useStore((s) => s.activeId);
  const addDoc = useStore((s) => s.addDoc);
  const toast = useStore((s) => s.toast);
  const setBusy = useStore((s) => s.setBusy);
  const patchSettings = useStore((s) => s.patchSettings);
  const settings = useStore((s) => s.settings);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasDoc = Boolean(activeId);

  const onOpen = useCallback(async () => {
    try {
      const files = await openPdfFiles();
      if (!files || !files.length) return;
      setBusy("Opening " + files.length + " file(s)…");
      for (const f of files) {
        try {
          const bytes = new Uint8Array(await f.file.arrayBuffer());
          const { doc } = await loadBytesToDoc(f.file.name, bytes);
          addDoc(doc);
          addRecent(f.file.name);
        } catch (e: any) {
          if (String(e?.message) === "PDF_PASSWORD_REQUIRED") {
            const pw = window.prompt("Password for " + f.file.name);
            if (pw) {
              const bytes = new Uint8Array(await f.file.arrayBuffer());
              const { doc } = await loadBytesToDoc(f.file.name, bytes, pw);
              addDoc(doc);
            }
          } else {
            toast("Could not open " + f.file.name, "error");
          }
        }
      }
    } finally {
      setBusy(null);
    }
  }, [addDoc, toast, setBusy]);

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "sepia" : "light";
    setTheme(next);
  };

  return (
    <header className="no-print relative z-40 flex h-12 items-center gap-1 border-b border-line surface px-1.5 sm:h-14 sm:px-3">
      <button
        className="tool-btn hidden h-9 w-9 md:inline-flex"
        aria-label={sidebarOpen ? "Hide thumbnails" : "Show thumbnails"}
        data-active={sidebarOpen}
        onClick={() => setSidebar(!sidebarOpen)}
      >
        <Columns2 size={18} />
      </button>

      <div className="mr-1 flex items-center gap-1.5 pl-0.5 md:pl-0">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
          P
        </span>
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">PdfEditz</span>
      </div>

      <button className="tool-btn h-9 gap-1.5 px-2 text-sm" onClick={onOpen} aria-label="Open PDF">
        <FilePlus2 size={18} />
        <span className="hidden sm:inline">Open</span>
      </button>

      <div className="mx-0.5 h-6 w-px bg-[var(--line)]" />

      <button className="tool-btn h-9 w-9" onClick={() => hasDoc && undo()} disabled={!hasDoc} aria-label="Undo">
        <Undo2 size={18} />
      </button>
      <button className="tool-btn h-9 w-9" onClick={() => hasDoc && redo()} disabled={!hasDoc} aria-label="Redo">
        <Redo2 size={18} />
      </button>

      {/* primary tools — scrollable on mobile */}
      <div className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
        {PRIMARY_TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className="tool-btn h-9 shrink-0 px-2 text-xs"
              data-active={tool === t.id}
              title={t.label + (t.key ? " (" + t.key + ")" : "")}
              onClick={() => setTool(t.id)}
            >
              <Icon size={17} />
            </button>
          );
        })}
      </div>

      <button className="tool-btn h-9 w-9" onClick={cycleTheme} aria-label="Theme">
        <SunMoon size={18} />
      </button>
      <button className="tool-btn h-9 w-9" onClick={() => openDialog("search")} aria-label="Search">
        <Search size={18} />
      </button>
      <button
        className="tool-btn hidden h-9 w-9 sm:inline-flex"
        onClick={() => setGridView(true)}
        disabled={!hasDoc}
        aria-label="Page grid"
      >
        <Grid3x3 size={18} />
      </button>
      <button
        className="tool-btn hidden h-9 w-9 sm:inline-flex"
        data-active={Boolean(splitId)}
        onClick={() => {
          if (!hasDoc) return;
          if (splitId) return setSplit(null);
          const other = order.find((id) => id !== activeId);
          if (!other) return toast("Open a second PDF to split the screen", "info");
          setSplit(other);
        }}
        aria-label="Split screen"
      >
        <Settings2 size={18} />
      </button>
      <button className="tool-btn h-9 w-9" onClick={() => window.print()} disabled={!hasDoc} aria-label="Print">
        <Printer size={18} />
      </button>

      <button className="tool-btn h-9 gap-1.5 px-2 text-sm" data-active onClick={() => openDialog("export")} disabled={!hasDoc}>
        <FileDown size={18} />
        <span className="hidden sm:inline">Export</span>
      </button>

      <div className="relative" ref={menuRef}>
        <button className="tool-btn h-9 w-9" data-active={menu} onClick={() => setMenu((v) => !v)} aria-label="More">
          <Menu size={18} />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-11 z-40 w-60 animate-fade-in overflow-hidden rounded-xl border border-line surface py-1 text-sm shadow-2xl">
              {[
                { label: "Signatures & initials", icon: Signature, fn: () => openDialog("signature") },
                { label: "Buttons/Forms fields", icon: Type, fn: () => openDialog("fields") },
                { label: "AI tools (OCR, redact, summary)", icon: Sparkles, fn: () => openDialog("ai") },
                { label: "Batch process…", icon: Layers2, fn: () => openDialog("batch") },
                { label: "Document outline", icon: ListOrdered, fn: () => openDialog("outline") },
                { label: "Keyboard shortcuts", icon: Languages, fn: () => openDialog("shortcuts") },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      setMenu(false);
                      item.fn();
                    }}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <div className="my-1 h-px bg-[var(--line)]" />
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                onClick={() => {
                  setMenu(false);
                  const m: typeof scrollMode = scrollMode === "vertical" ? "horizontal" : scrollMode === "horizontal" ? "single" : "vertical";
                  setScrollMode(m);
                }}
              >
                <ChevronDown size={16} />
                <span>Scroll mode: {scrollMode}</span>
              </button>
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                onClick={() => {
                  setMenu(false);
                  patchSettings({ bold: !settings.bold });
                }}
              >
                <Wand2 size={16} />
                <span>{settings.bold ? "Text: bold on" : "Text: bold off"}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
