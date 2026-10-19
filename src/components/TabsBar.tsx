"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, Plus, X, FileText, GripVertical } from "lucide-react";
import { useStore } from "@/store/useStore";
import { openPdfFiles } from "@/lib/fileOpen";
import { loadBytesToDoc } from "@/lib/loader";

export default function TabsBar() {
  const order = useStore((s) => s.order);
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const splitId = useStore((s) => s.splitId);
  const setActive = useStore((s) => s.setActive);
  const setSplit = useStore((s) => s.setSplit);
  const moveTab = useStore((s) => s.moveTab);
  const removeDoc = useStore((s) => s.removeDoc);
  const addDoc = useStore((s) => s.addDoc);
  const toast = useStore((s) => s.toast);
  const visible = useStore((s) => s.tabsBarVisible);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current?.querySelector(`[data-tab="${activeId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeId]);

  if (!visible || order.length === 0) return null;

  return (
    <div className="no-print flex items-end gap-1 border-b border-line surface px-2 pt-1.5">
      <div
        ref={scroller}
        className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto scrollbar-thin"
        onDragOver={(e) => e.preventDefault()}
      >
        {order.map((id, i) => {
          const d = docs[id];
          if (!d) return null;
          const active = id === activeId;
          return (
            <div
              key={id}
              data-tab={id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIdx(i);
              }}
              onDragEnd={() => {
                if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) moveTab(dragIdx, overIdx);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== i) moveTab(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={
                "group flex max-w-[46vw] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 py-2 text-sm transition sm:max-w-[240px] " +
                (active
                  ? "border-line surface-2 font-semibold"
                  : "border-transparent text-soft hover:surface-2") +
                (overIdx === i && dragIdx !== null && dragIdx !== i ? " outline outline-1 outline-[var(--accent)]" : "")
              }
              onClick={() => setActive(id)}
              title={d.name}
            >
              <GripVertical size={13} className="hidden shrink-0 opacity-30 group-hover:opacity-70 sm:block" />
              <FileText size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{d.name.replace(/\.pdf$/i, "")}</span>
              {d.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" title="Unsaved changes" />}
              <button
                className="shrink-0 rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                aria-label={"Close " + d.name}
                onClick={(e) => {
                  e.stopPropagation();
                  if (d.dirty && !window.confirm("Discard unsaved changes in " + d.name + "?")) return;
                  removeDoc(id);
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pb-1 pl-1">
        <button
          className="tool-btn h-9 w-9"
          title="Split-screen view"
          data-active={splitId ? "true" : "false"}
          onClick={() => {
            if (splitId) return setSplit(null);
            const other = order.find((o) => o !== activeId);
            if (!other) return toast("Open a second PDF to split the screen", "info");
            setSplit(other);
          }}
        >
          <Columns2 size={16} />
        </button>
        <button
          className="tool-btn h-9 w-9"
          title="Open another PDF"
          onClick={async () => {
            const files = await openPdfFiles();
            if (!files?.length) return;
            for (const f of files) {
              try {
                const bytes = new Uint8Array(await f.arrayBuffer());
                const { doc } = await loadBytesToDoc(f.name, bytes);
                addDoc(doc);
              } catch {
                toast("Could not open " + f.name, "error");
              }
            }
          }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}