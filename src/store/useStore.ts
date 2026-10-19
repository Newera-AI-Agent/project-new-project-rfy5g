"use client";

import { create } from "zustand";
import type {
  Annotation,
  PdfDoc,
  PageMeta,
  ToolId,
  ThemeName,
  ScrollMode,
  SavedSignature,
  FormFieldInfo,
  OutlineItem,
} from "@/lib/types";
import { uid, haptic } from "@/lib/utils";
import { idb } from "@/lib/persistence";

export interface ToolSettings {
  color: string;
  opacity: number;
  strokeWidth: number;
  fontSize: number;
  font: "Helvetica" | "TimesRoman" | "Courier";
  bold: boolean;
  fill: string;
  stampText: string;
  stampColor: string;
}

export interface Toast {
  id: string;
  msg: string;
  kind: "info" | "success" | "error";
}

export interface SearchHit {
  docId: string;
  pageIndex: number;
  snippet: string;
  index: number;
}

interface StoreState {
  // documents
  docs: Record<string, PdfDoc>;
  order: string[];
  activeId: string | null;
  splitId: string | null;

  // workspace settings
  tool: ToolId;
  settings: ToolSettings;
  zoom: Record<string, number>;
  scrollPos: Record<string, number>;
  scrollMode: ScrollMode;
  theme: ThemeName;
  highContrast: boolean;
  sidebarOpen: boolean;
  gridView: boolean;
  tabsBarVisible: boolean;

  // ephemeral
  selection: { docId: string; ids: string[] } | null;
  searchQuery: string;
  searchHits: SearchHit[];
  searching: boolean;
  busy: string | null;
  toasts: Toast[];
  signatures: SavedSignature[];
  hydrated: boolean;

  // actions
  addDoc: (doc: PdfDoc) => void;
  removeDoc: (id: string) => void;
  closeAll: () => void;
  setActive: (id: string) => void;
  setSplit: (id: string | null) => void;
  moveTab: (from: number, to: number) => void;
  renameDoc: (id: string, name: string) => void;
  patchDoc: (id: string, patch: Partial<PdfDoc>) => void;
  setPageOrder: (id: string, pages: PageMeta[]) => void;
  rotatePages: (id: string, positions: number[], delta: number) => void;
  deletePages: (id: string, positions: number[]) => void;
  cropPage: (id: string, position: number, crop: PdfDoc["pages"][number]["crop"]) => void;
  insertBlank: (id: string, at: number, w?: number, h?: number) => void;
  addPagesFromDoc: (targetId: string, source: PdfDoc, positions: number[], at: number) => void;

  addAnnotation: (docId: string, anno: Annotation) => void;
  updateAnnotation: (docId: string, id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (docId: string, id: string) => void;
  clearAnnotations: (docId: string, pageIndex?: number) => void;
  redactAll: (docId: string) => void;

  setTool: (t: ToolId) => void;
  patchSettings: (p: Partial<ToolSettings>) => void;
  setZoom: (docId: string, z: number) => void;
  setScrollPos: (docId: string, y: number) => void;
  setScrollMode: (m: ScrollMode) => void;
  setTheme: (t: ThemeName) => void;
  toggleContrast: () => void;
  setSidebar: (v: boolean) => void;
  setGridView: (v: boolean) => void;
  setTabsBar: (v: boolean) => void;
  setSelection: (s: StoreState["selection"]) => void;

  runSearch: (q: string) => Promise<void>;
  clearSearch: () => void;
  setBusy: (b: string | null) => void;
  toast: (msg: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;

  loadSignatures: () => Promise<void>;
  saveSignature: (sig: SavedSignature) => Promise<void>;
  deleteSignature: (id: string) => Promise<void>;

  setFields: (docId: string, fields: FormFieldInfo[]) => void;
  setOutline: (docId: string, outline: OutlineItem[]) => void;

  hydrate: () => Promise<void>;
  persistWorkspace: () => Promise<void>;
  persistDoc: (id: string) => Promise<void>;
}

const defaultSettings: ToolSettings = {
  color: "#facc15",
  opacity: 0.4,
  strokeWidth: 3,
  fontSize: 16,
  font: "Helvetica",
  bold: false,
  fill: "none",
  stampText: "APPROVED",
  stampColor: "#16a34a",
};

export const useStore = create<StoreState>((set, get) => ({
  docs: {},
  order: [],
  activeId: null,
  splitId: null,

  tool: "select",
  settings: defaultSettings,
  zoom: {},
  scrollPos: {},
  scrollMode: "vertical",
  theme: "light",
  highContrast: false,
  sidebarOpen: false,
  gridView: false,
  tabsBarVisible: true,

  selection: null,
  searchQuery: "",
  searchHits: [],
  searching: false,
  busy: null,
  toasts: [],
  signatures: [],
  hydrated: false,

  addDoc: (doc) =>
    set((s) => ({
      docs: { ...s.docs, [doc.id]: doc },
      order: [...s.order, doc.id],
      activeId: doc.id,
      zoom: { ...s.zoom, [doc.id]: s.zoom[doc.id] ?? 1 },
      scrollPos: { ...s.scrollPos, [doc.id]: 0 },
    })),

  removeDoc: (id) =>
    set((s) => {
      const docs = { ...s.docs };
      delete docs[id];
      const order = s.order.filter((x) => x !== id);
      const activeId = s.activeId === id ? order[order.length - 1] ?? null : s.activeId;
      const splitId = s.splitId === id ? null : s.splitId;
      return { docs, order, activeId, splitId };
    }),

  closeAll: () => set({ docs: {}, order: [], activeId: null, splitId: null }),

  setActive: (id) => set({ activeId: id }),
  setSplit: (id) => set({ splitId: id }),

  moveTab: (from, to) =>
    set((s) => {
      const order = [...s.order];
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      haptic(10);
      return { order };
    }),

  renameDoc: (id, name) =>
    set((s) => (s.docs[id] ? { docs: { ...s.docs, [id]: { ...s.docs[id], name, dirty: true } } } : {})),

  patchDoc: (id, patch) =>
    set((s) => {
      const d = s.docs[id];
      if (!d) return {};
      return { docs: { ...s.docs, [id]: { ...d, ...patch, dirty: true } } };
    }),

  setPageOrder: (id, pages) =>
    set((s) => {
      const d = s.docs[id];
      if (!d) return {};
      // Remap annotations to new positions.
      const idToNew = new Map<string, number>();
      pages.forEach((p, i) => idToNew.set(p.id, i));
      const annotations = d.annotations
        .map((a) => {
          const oldPage = d.pages[a.pageIndex];
          if (!oldPage) return a;
          const np = idToNew.get(oldPage.id);
          return np === undefined ? a : { ...a, pageIndex: np };
        })
        .filter((a) => a.pageIndex >= 0 && a.pageIndex < pages.length);
      return { docs: { ...s.docs, [id]: { ...d, pages, annotations, dirty: true } } };
    }),

  rotatePages: (id, positions, delta) =>
    set((s) => {
      const d = s.docs[id];
      if (!d) return {};
      const pages = d.pages.map((p, i) =>
        positions.includes(i) ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p,
      );
      haptic(8);
      return { docs: { ...s.docs, [id]: { ...d, pages, dirty: true } } };
    }),

  deletePages: (id, positions) =>
    set((s) => {
      const d = s.docs[id];
      if (!d) return {};
      const setP = new Set(positions);
      if (setP.size >= d.pages.length) return {};
      const pages = d.pages.filter((_, i) => !setP.has(i));
      const remap = new Map<number, number>();
      let n = 0;
      d.pages.forEach((_, i) => {
        if (!setP.has(i)) remap.set(i, n++);
      });
      const annotations = d.annotations
        .map((a) => ({ ...a, pageIndex: remap.get(a.pageIndex) ?? -1 }))
        .filter((a) => a.pageIndex >= 0);
      haptic(15);
      return { docs: { ...s.docs, [id]: { ...d, pages, annotations, dirty: true } } };
    }),

  cropPage: (id, position, crop) =>
    set((s) => {
      const d = s.docs[id];
      if (!d) return {};
      const pages = d.pages.map((p, i) => (i === position ? { ...p, crop } : p));
      return { docs: { ...s.docs, [id]: { ...d, pages, dirty: true } } };
    }),

  insertBlank: (id, at, w = 612, h = 792) =>
    set((s) => {
      const d = s.docs[id];
      if (!d) return {};
      const blank: PageMeta = { id: uid("blank"), srcIndex: -1, rotation: 0, blank: true, width: w, height: h };
      const pages = [...d.pages];
      pages.splice(at, 0, blank);
      const annotations = d.annotations.map((a) => (a.pageIndex >= at ? { ...a, pageIndex: a.pageIndex + 1 } : a));
      haptic(10);
      return { docs: { ...s.docs, [id]: { ...d, pages, annotations, dirty: true } } };
    }),

  addPagesFromDoc: (targetId, source, positions, at) =>
    set((s) => {
      const d = s.docs[targetId];
      if (!d) return {};
      const metas: PageMeta[] = [];
      for (const p of positions) {
        const sp = source.pages[p];
        if (sp) metas.push({ ...sp, id: uid("pg"), rotation: sp.rotation });
      }
      const pages = [...d.pages];
      pages.splice(at, 0, ...metas);
      const annotations = d.annotations.map((a) => (a.pageIndex >= at ? { ...a, pageIndex: a.pageIndex + positions.length } : a));
      haptic(20);
      return { docs: { ...s.docs, [targetId]: { ...d, pages, annotations, dirty: true } } };
    }),

  addAnnotation: (docId, anno) =>
    set((s) => {
      const d = s.docs[docId];
      if (!d) return {};
      const maxZ = d.annotations.reduce((m, a) => Math.max(m, a.z), 0);
      return { docs: { ...s.docs, [docId]: { ...d, annotations: [...d.annotations, { ...anno, z: anno.z ?? maxZ + 1 } as Annotation], dirty: true } } };
    }),

  updateAnnotation: (docId, id, patch) =>
    set((s) => {
      const d = s.docs[docId];
      if (!d) return {};
      return {
        docs: { ...s.docs, [docId]: { ...d, annotations: d.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)), dirty: true } },
      };
    }),

  removeAnnotation: (docId, id) =>
    set((s) => {
      const d = s.docs[docId];
      if (!d) return {};
      return { docs: { ...s.docs, [docId]: { ...d, annotations: d.annotations.filter((a) => a.id !== id), dirty: true } } };
    }),

  clearAnnotations: (docId, pageIndex) =>
    set((s) => {
      const d = s.docs[docId];
      if (!d) return {};
      const annotations = pageIndex === undefined ? [] : d.annotations.filter((a) => a.pageIndex !== pageIndex);
      return { docs: { ...s.docs, [docId]: { ...d, annotations, dirty: true } } };
    }),

  redactAll: (docId) =>
    set((s) => {
      const d = s.docs[docId];
      if (!d) return {};
      const annotations = d.annotations.map((a) => (a.kind === "redact" ? { ...a, applied: true } : a));
      return { docs: { ...s.docs, [docId]: { ...d, annotations, dirty: true } } };
    }),

  setTool: (t) => set({ tool: t }),
  patchSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  setZoom: (docId, z) => set((s) => ({ zoom: { ...s.zoom, [docId]: Math.min(6, Math.max(0.25, z)) } })),
  setScrollPos: (docId, y) => set((s) => ({ scrollPos: { ...s.scrollPos, [docId]: y } })),
  setScrollMode: (m) => set({ scrollMode: m }),
  setTheme: (t) => set({ theme: t }),
  toggleContrast: () => set((s) => ({ highContrast: !s.highContrast })),
  setSidebar: (v) => set({ sidebarOpen: v }),
  setGridView: (v) => set({ gridView: v }),
  setTabsBar: (v) => set({ tabsBarVisible: v }),
  setSelection: (s2) => set({ selection: s2 }),

  runSearch: async (q) => {
    const query = q.trim();
    if (!query) {
      set({ searchHits: [], searchQuery: "", searching: false });
      return;
    }
    set({ searching: true, searchQuery: query });
    const hits: SearchHit[] = [];
    const { docs, order } = get();
    const { getPdfjs, getPageTextString } = await import("@/lib/pdfEngine");
    const pdfjs = await getPdfjs();
    for (const docId of order) {
      const d = docs[docId];
      if (!d) continue;
      try {
        const pdf = await pdfjs.getDocument({ data: d.bytes.slice(0) }).promise;
        const seen = new Set<number>();
        for (const meta of d.pages) {
          if (seen.has(meta.srcIndex) || meta.blank) continue;
          seen.add(meta.srcIndex);
          const idx = d.pages.findIndex((p) => p.id === meta.id);
          const text = await getPageTextString(pdf, meta.srcIndex + 1);
          const lower = text.toLowerCase();
          const needle = query.toLowerCase();
          let from = 0;
          while (true) {
            const at = lower.indexOf(needle, from);
            if (at < 0) break;
            hits.push({ docId, pageIndex: idx, snippet: text.slice(Math.max(0, at - 40), at + query.length + 40), index: hits.length });
            from = at + needle.length;
            if (hits.length > 500) break;
          }
        }
        await pdf.destroy();
      } catch {
        /* skip unreadable doc */
      }
    }
    set({ searchHits: hits, searching: false });
  },

  clearSearch: () => set({ searchQuery: "", searchHits: [] }),
  setBusy: (b) => set({ busy: b }),

  toast: (msg, kind = "info") => {
    const id = uid("toast");
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loadSignatures: async () => {
    try {
      const sigs = await idb.allSignatures();
      set({ signatures: sigs.sort((a, b) => b.createdAt - a.createdAt) });
    } catch {
      /* ignore */
    }
  },
  saveSignature: async (sig) => {
    await idb.putSignature(sig);
    set((s) => ({ signatures: [sig, ...s.signatures] }));
  },
  deleteSignature: async (id) => {
    await idb.deleteSignature(id);
    set((s) => ({ signatures: s.signatures.filter((s2) => s2.id !== id) }));
  },

  setFields: (docId, fields) => get().patchDoc(docId, { fields }),
  setOutline: (docId, outline) => get().patchDoc(docId, { outline }),

  persistDoc: async (id) => {
    const d = get().docs[id];
    if (!d) return;
    try {
      await idb.putDoc({
        id: d.id,
        name: d.name,
        bytes: d.bytes.slice(0),
        size: d.size,
        pageCount: d.pageCount,
        pages: d.pages,
        annotations: d.annotations,
        outline: d.outline,
        fields: d.fields,
        updatedAt: Date.now(),
      });
    } catch {
      /* quota — ignore */
    }
  },

  persistWorkspace: async () => {
    const s = get();
    try {
      await idb.putWorkspace({
        key: "workspace",
        order: s.order,
        activeId: s.activeId,
        zoomByDoc: s.zoom,
        scrollByDoc: s.scrollPos,
        theme: s.theme,
        updatedAt: Date.now(),
      });
    } catch {
      /* ignore */
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const ws = await idb.getWorkspace();
      const docs = await idb.allDocs();
      const map: Record<string, PdfDoc> = {};
      for (const d of docs) {
        map[d.id] = {
          id: d.id,
          name: d.name,
          bytes: d.bytes,
          size: d.size,
          pageCount: d.pageCount,
          pages: d.pages,
          annotations: d.annotations ?? [],
          outline: d.outline ?? [],
          fields: d.fields ?? [],
        };
      }
      const storedOrder = ws?.order?.filter((id) => map[id]) ?? [];
      const extra = Object.keys(map).filter((id) => !storedOrder.includes(id));
      const order = [...storedOrder, ...extra];
      set({
        docs: map,
        order,
        activeId: ws?.activeId && map[ws.activeId] ? ws.activeId : order[0] ?? null,
        zoom: ws?.zoomByDoc ?? {},
        scrollPos: ws?.scrollByDoc ?? {},
        theme: (ws?.theme as ThemeName) || "light",
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
    await get().loadSignatures();
  },
}));