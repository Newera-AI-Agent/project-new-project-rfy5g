"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import Landing from "@/components/Landing";
import TabsBar from "@/components/TabsBar";
import Toolbar from "@/components/Toolbar";
import PageSidebar from "@/components/PageSidebar";
import PdfViewport from "@/components/PdfViewport";
import ToolPanel from "@/components/ToolPanel";
import SearchPanel from "@/components/SearchPanel";
import OutlinePanel from "@/components/OutlinePanel";
import ExportDialog from "@/components/ExportDialog";
import SignatureDialog from "@/components/SignatureDialog";
import Toasts from "@/components/Toasts";
import MobileSheet from "@/components/MobileSheet";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { seedDemoDocs } from "@/lib/demo";
import BatchDialog from "@/components/BatchDialog";
import FieldsPanel from "@/components/FieldsPanel";
import AiPanel from "@/components/AiPanel";

export default function AppShell() {
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const docs = useStore((s) => s.docs);
  const order = useStore((s) => s.order);
  const theme = useStore((s) => s.theme);
  const highContrast = useStore((s) => s.highContrast);
  const persistWorkspace = useStore((s) => s.persistWorkspace);
  const persistDoc = useStore((s) => s.persistDoc);
  const [booted, setBooted] = useState(false);
  const seeded = useRef(false);

  useKeyboardShortcuts();

  useEffect(() => {
    hydrate().then(() => setBooted(true));
  }, [hydrate]);

  // Seed demo docs once on first ever visit (no persisted docs).
  useEffect(() => {
    if (!booted || seeded.current) return;
    if (order.length === 0 && docs && Object.keys(docs).length === 0) {
      seeded.current = true;
      const everSeen = typeof localStorage !== "undefined" && localStorage.getItem("pdfeditz-seen");
      if (!everSeen) {
        localStorage?.setItem("pdfeditz-seen", "1");
        seedDemoDocs();
      }
    }
  }, [booted, order.length, docs]);

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark", "theme-sepia");
    root.classList.add("theme-" + theme);
    root.classList.toggle("hc", highContrast);
    try {
      localStorage.setItem("pdfeditz-theme", theme);
    } catch {}
  }, [theme, highContrast]);

  // Autosave every 5s (R51)
  useEffect(() => {
    if (!booted) return;
    const t = setInterval(() => {
      const st = useStore.getState();
      st.persistWorkspace();
      st.docs[st.activeId ?? ""] && st.persistDoc(st.activeId as string);
      Object.keys(st.docs).forEach((id) => {
        if (st.docs[id].dirty) {
          st.persistDoc(id);
          st.patchDoc(id, { dirty: false });
        }
      });
    }, 5000);
    return () => clearInterval(t);
  }, [booted, persistWorkspace, persistDoc]);

  // Warn before unload if unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const st = useStore.getState();
      if (Object.values(st.docs).some((d) => d.dirty)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const activeId = useStore((s) => s.activeId);
  const splitId = useStore((s) => s.splitId);
  const gridView = useStore((s) => s.gridView);

  if (!booted) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex items-center gap-3 text-soft">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Restoring workspace…
        </div>
      </div>
    );
  }

  if (order.length === 0) {
    return (
      <>
        <Landing />
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Toolbar />
      <TabsBar />
      <div className="relative flex min-h-0 flex-1">
        <PageSidebar />
        <main className="relative flex min-w-0 flex-1 flex-col">
          {gridView ? (
            <GridView />
          ) : (
            <div className={"flex min-h-0 flex-1 " + (splitId ? "flex-col md:flex-row" : "")}>
              <PdfViewport docId={activeId as string} />
              {splitId && <PdfViewport docId={splitId} split />}
            </div>
          )}
          <ToolPanel />
        </main>
        <OutlinePanel />
        <SearchPanel />
      </div>
      <MobileSheet />
      <ExportDialog />
      <SignatureDialog />
      <FieldsPanel />
      <AiPanel />
      <BatchDialog />
      <ShortcutsHelp />
      <Toasts />
    </div>
  );
}

function GridView() {
  const activeId = useStore((s) => s.activeId);
  const docs = useStore((s) => s.docs);
  const doc = activeId ? docs[activeId] : null;
  const setGridView = useStore((s) => s.setGridView);
  const setZoom = useStore((s) => s.setZoom);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { page: number };
      setPage(detail.page);
      setGridView(false);
      if (activeId) setZoom(activeId, 1);
      setTimeout(() => window.dispatchEvent(new CustomEvent("pdfeditz-goto", { detail: { page: detail.page } })), 60);
    };
    window.addEventListener("pdfeditz-grid-open", handler);
    return () => window.removeEventListener("pdfeditz-grid-open", handler);
  }, [activeId, setGridView, setZoom]);

  if (!doc) return null;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Page grid — {doc.pages.length} pages
        </h2>
        <button className="tool-btn px-3 text-sm" onClick={() => setGridView(false)}>
          Close
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {doc.pages.map((p, i) => (
          <GridThumb key={p.id} docId={doc.id} index={i} />
        ))}
      </div>
    </div>
  );
}

function GridThumb({ docId, index }: { docId: string; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const st = useStore.getState();
        const doc = st.docs[docId];
        if (!doc) return;
        const { getPdfjs, renderPageToDataUrl } = await import("@/lib/pdfEngine");
        const meta = doc.pages[index];
        if (meta.blank) {
          const w = meta.width ?? 612;
          const h = meta.height ?? 792;
          const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}">` +
            `<rect width="100%" height="100%" fill="#ffffff"/></svg>`;
          if (!cancel) setUrl("data:image/svg+xml;base64," + btoa(svg));
          return;
        }
        const pdfjs = await getPdfjs();
        const pdf = await pdfjs.getDocument({ data: doc.bytes.slice(0) }).promise;
        const dataUrl = await renderPageToDataUrl(pdf, meta.srcIndex + 1, {
          scale: 0.28,
          rotation: meta.rotation,
          crop: meta.crop,
          type: "image/png",
        });
        if (!cancel) setUrl(dataUrl);
        await pdf.destroy();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [docId, index]);
  return (
    <button
      className="group flex flex-col items-center gap-2 rounded-xl border border-line surface p-2 transition hover:border-current"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("pdfeditz-grid-open", { detail: { page: index } }))
      }
    >
      <div className="relative w-full overflow-hidden rounded-lg bg-black/5">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Page ${index + 1}`} className="w-full" />
        ) : (
          <div className="aspect-[3/4] w-full animate-pulse bg-current/5" />
        )}
      </div>
      <span className="text-xs font-medium text-soft">{index + 1}</span>
    </button>
  );
}