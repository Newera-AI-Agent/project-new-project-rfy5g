"use client";

// IndexedDB persistence layer — workspace autosave (R5/R51) + saved signatures (R24).

import type { Annotation, FormFieldInfo, OutlineItem, PageMeta, SavedSignature } from "./types";

const DB_NAME = "pdfeditz";
const DB_VERSION = 1;
const STORE_DOCS = "docs";
const STORE_META = "meta";
const STORE_SIGS = "signatures";

export interface StoredDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  size: number;
  pageCount: number;
  pages: PageMeta[];
  annotations: Annotation[];
  outline: OutlineItem[];
  fields: FormFieldInfo[];
  updatedAt: number;
}

export interface WorkspaceState {
  key: "workspace";
  order: string[];
  activeId: string | null;
  zoomByDoc: Record<string, number>;
  scrollByDoc: Record<string, number>;
  theme?: string;
  updatedAt: number;
}

let dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_DOCS)) db.createObjectStore(STORE_DOCS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORE_SIGS)) db.createObjectStore(STORE_SIGS, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  async putDoc(d: StoredDoc) {
    return tx<void>(STORE_DOCS, "readwrite", (s) => s.put(d));
  },
  async getDoc(id: string) {
    return tx<StoredDoc | undefined>(STORE_DOCS, "readonly", (s) => s.get(id));
  },
  async allDocs() {
    return tx<StoredDoc[]>(STORE_DOCS, "readonly", (s) => s.getAll());
  },
  async deleteDoc(id: string) {
    return tx<void>(STORE_DOCS, "readwrite", (s) => s.delete(id));
  },
  async putWorkspace(w: WorkspaceState) {
    return tx<void>(STORE_META, "readwrite", (s) => s.put(w));
  },
  async getWorkspace() {
    return tx<WorkspaceState | undefined>(STORE_META, "readonly", (s) => s.get("workspace"));
  },
  async putSignature(sig: SavedSignature) {
    return tx<void>(STORE_SIGS, "readwrite", (s) => s.put(sig));
  },
  async allSignatures() {
    return tx<SavedSignature[]>(STORE_SIGS, "readonly", (s) => s.getAll());
  },
  async deleteSignature(id: string) {
    return tx<void>(STORE_SIGS, "readwrite", (s) => s.delete(id));
  },
  async clearAll() {
    await tx<void>(STORE_DOCS, "readwrite", (s) => s.clear());
    await tx<void>(STORE_SIGS, "readwrite", (s) => s.clear());
  },
};

export async function estimateUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { used: e.usage || 0, quota: e.quota || 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}