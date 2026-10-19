"use client";

import { useEffect, useState } from "react";
import { Bookmark, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog } from "@/lib/dialogs";
import type { OutlineItem } from "@/lib/types";

export default function OutlinePanel() {
  const { open } = useDialog("outline");
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => (activeId ? s.docs[activeId] : null));
  const patchDoc = useStore((s) => s.patchDoc);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) closeDialog("outline");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !doc) return null;

  const go = (page: number) => {
    window.dispatchEvent(new CustomEvent("pdfeditz-goto", { detail: { page, docId: doc.id } }));
    if (window.innerWidth < 768) closeDialog("outline");
  };

  const addBookmark = () => {
    const title = draft.trim();
    if (!title) return;
    const item: OutlineItem = { title, page: 0 };
    patchDoc(doc.id, { outline: [...doc.outline, item], dirty: true });
    setDraft("");
    toast("Bookmark added", "success");
  };

  const remove = (index: number) => {
    const next = doc.outline.filter((_, i) => i !== index);
    patchDoc(doc.id, { outline: next, dirty: true });
  };

  const rename = (index: number, title: string) => {
    const next = doc.outline.map((o, i) => (i === index ? { ...o, title } : o));
    patchDoc(doc.id, { outline: next, dirty: true });
  };

  const setPage = (index: number, page: number) => {
    const next = doc.outline.map((o, i) => (i === index ? { ...o, page } : o));
    patchDoc(doc.id, { outline: next, dirty: true });
  };

  return (
    <aside
      data-dialog-panel
      className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl border border-line surface shadow-2xl animate-slide-up md:absolute md:inset-y-0 md:left-0 md:bottom-auto md:max-h-none md:w-[300px] md:animate-fade-in md:rounded-none md:rounded-r-2xl"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Bookmark size={16} className="text-soft" />
        <h2 className="flex-1 text-sm font-semibold">Outline &amp; bookmarks</h2>
        <button className="tool-btn h-8 w-8" onClick={() => closeDialog("outline")} aria-label="Close outline">
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {doc.outline.length === 0 && (
          <p className="px-2 py-4 text-sm text-soft">
            No bookmarks found in this document. Add one below to build your own navigation.
          </p>
        )}
        {doc.outline.map((item, i) => (
          <div key={i} className="group mb-1 rounded-lg px-1.5 py-1.5 hover:bg-[var(--surface-2)]">
            <div className="flex items-center gap-1.5">
              <ChevronRight size={13} className="shrink-0 text-soft" />
              <input
                value={item.title}
                onChange={(e) => rename(i, e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                className="tool-btn h-7 w-7 opacity-60 group-hover:opacity-100"
                onClick={() => remove(i)}
                aria-label="Remove bookmark"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-5">
              <input
                type="number"
                min={1}
                max={doc.pages.length}
                value={item.page + 1}
                onChange={(e) => setPage(i, Math.max(0, Number(e.target.value) - 1))}
                className="w-14 rounded-md border border-line surface-2 px-1.5 py-0.5 text-xs"
                aria-label="Bookmark page"
              />
              <button className="text-xs font-medium text-[var(--accent)]" onClick={() => go(item.page)}>
                Go to page
              </button>
            </div>
            {item.children && item.children.length > 0 && (
              <div className="ml-5 mt-1 space-y-1 border-l border-line pl-2">
                {item.children.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => go(c.page)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-soft hover:text-[var(--text)]"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addBookmark()}
          placeholder="New bookmark title"
          className="min-w-0 flex-1 rounded-lg border border-line surface-2 px-2 py-1.5 text-sm outline-none"
        />
        <button className="btn-primary h-9 px-3 text-sm" onClick={addBookmark}>
          <Plus size={15} /> Add
        </button>
      </div>
    </aside>
  );
}