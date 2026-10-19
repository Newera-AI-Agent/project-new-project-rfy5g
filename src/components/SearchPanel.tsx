"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog } from "@/lib/dialogs";

export default function SearchPanel() {
  const { open } = useDialog("search");
  const query = useStore((s) => s.searchQuery);
  const hits = useStore((s) => s.searchHits);
  const searching = useStore((s) => s.searching);
  const runSearch = useStore((s) => s.runSearch);
  const clearSearch = useStore((s) => s.clearSearch);
  const setActive = useStore((s) => s.setActive);
  const docs = useStore((s) => s.docs);
  const [q, setQ] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) closeDialog("search");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const go = (docId: string, pageIndex: number) => {
    setActive(docId);
    window.dispatchEvent(new CustomEvent("pdfeditz-goto", { detail: { page: pageIndex, docId } }));
    if (window.innerWidth < 768) closeDialog("search");
  };

  const grouped = hits.reduce<Record<string, typeof hits>>((acc, h) => {
    (acc[h.docId] ??= []).push(h);
    return acc;
  }, {});

  return (
    <aside
      data-dialog-panel
      className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl border border-line surface shadow-2xl animate-slide-up md:absolute md:inset-y-0 md:right-0 md:bottom-auto md:max-h-none md:w-[380px] md:animate-fade-in md:rounded-none md:rounded-l-2xl"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Search size={16} className="text-soft" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch(q)}
          placeholder="Search all open PDFs…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {q && (
          <button className="tool-btn h-8 w-8" onClick={() => { setQ(""); clearSearch(); }} aria-label="Clear">
            <X size={15} />
          </button>
        )}
        <button className="tool-btn h-8 px-2 text-xs" onClick={() => runSearch(q)}>
          Find
        </button>
        <button className="tool-btn h-8 w-8" onClick={() => closeDialog("search")} aria-label="Close search">
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {searching && <p className="px-2 py-4 text-sm text-soft">Searching every open document…</p>}
        {!searching && query && hits.length === 0 && (
          <p className="px-2 py-4 text-sm text-soft">No matches for “{query}”.</p>
        )}
        {!searching && !query && (
          <p className="px-2 py-4 text-sm text-soft">
            Type a word or phrase and press Enter to search across every open document at once.
          </p>
        )}
        {Object.entries(grouped).map(([docId, list]) => (
          <div key={docId} className="mb-2">
            <div className="sticky top-0 z-10 flex items-center gap-1.5 rounded-md surface px-2 py-1.5 text-xs font-semibold">
              <FileText size={13} />
              <span className="truncate">{docs[docId]?.name ?? "Document"}</span>
              <span className="text-soft">· {list.length}</span>
            </div>
            {list.map((h) => (
              <button
                key={h.index}
                onClick={() => go(h.docId, h.pageIndex)}
                className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="mb-0.5 block text-[11px] font-medium text-soft">Page {h.pageIndex + 1}</span>
                <span className="line-clamp-3 block leading-snug">
                  {highlight(h.snippet, query)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-yellow-300/70 px-0.5 text-[var(--text)]">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
