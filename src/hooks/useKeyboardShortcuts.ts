"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { openDialog, closeDialog } from "@/lib/dialogs";
import { openPdfFiles } from "@/lib/fileOpen";
import { loadBytesToDoc } from "@/lib/loader";
import { isEditableTarget } from "@/lib/utils";
import type { Annotation, PageMeta } from "@/lib/types";

interface Snapshot {
  docId: string;
  annotations: Annotation[];
  pages: PageMeta[];
}

const past: Snapshot[] = [];
const future: Snapshot[] = [];
let clipboard: Annotation[] = [];
let suppress = false;
let prevSnap: Snapshot | null = null;

function snap(): Snapshot | null {
  const st = useStore.getState();
  const id = st.activeId;
  if (!id) return null;
  const d = st.docs[id];
  if (!d) return null;
  return { docId: id, annotations: d.annotations, pages: d.pages };
}

function keyOf(s: Snapshot) {
  return s.docId + ":" + s.annotations.length + ":" + s.pages.map((p) => p.id + p.rotation).join(",");
}

/** Record the current active-doc state as the undo target (used by callers that mutate outside the store watcher). */
export function pushHistory() {
  const s = snap();
  if (!s) return;
  if (prevSnap && keyOf(prevSnap) === keyOf(s)) return;
  if (prevSnap) past.push(prevSnap);
  if (past.length > 60) past.shift();
  prevSnap = s;
  future.length = 0;
}

export function undo() {
  const s = snap();
  if (!s) return;
  // make sure the live state is on the stack before popping
  if (prevSnap && keyOf(prevSnap) !== keyOf(s)) {
    past.push(prevSnap);
    prevSnap = s;
  }
  const target = past.pop();
  if (!target) {
    useStore.getState().toast("Nothing to undo", "info");
    return;
  }
  suppress = true;
  future.push(s);
  useStore.getState().patchDoc(target.docId, { annotations: target.annotations, pages: target.pages });
  prevSnap = target;
  setTimeout(() => {
    suppress = false;
  }, 0);
}

export function redo() {
  const s = snap();
  if (!s) return;
  const target = future.pop();
  if (!target) {
    useStore.getState().toast("Nothing to redo", "info");
    return;
  }
  suppress = true;
  past.push(s);
  useStore.getState().patchDoc(target.docId, { annotations: target.annotations, pages: target.pages });
  prevSnap = target;
  setTimeout(() => {
    suppress = false;
  }, 0);
}

function selectedAnnos(): Annotation[] {
  const st = useStore.getState();
  const sel = st.selection;
  if (!sel) return [];
  const d = st.docs[sel.docId];
  if (!d) return [];
  return d.annotations.filter((a) => sel.ids.includes(a.id));
}

async function openFiles() {
  const files = await openPdfFiles();
  if (!files) return;
  for (const f of files) {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const res = await loadBytesToDoc(f.name, buf);
      useStore.getState().addDoc(res.doc);
    } catch {
      useStore.getState().toast("Could not open " + f.name, "error");
    }
  }
}

/** Global keyboard shortcuts for the workspace (PC power users). */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape") {
        const open = document.querySelector("[data-dialog-panel]");
        if (open) {
          closeDialog("export");
          closeDialog("signature");
          closeDialog("batch");
          closeDialog("shortcuts");
          closeDialog("fields");
          closeDialog("ai");
          closeDialog("search");
          closeDialog("outline");
          closeDialog("password");
          return;
        }
        if (st.selection) st.setSelection(null);
        else if (st.tool !== "select") st.setTool("select");
        return;
      }

      if (isEditableTarget(e.target)) {
        // Still allow undo while typing in an input
        if (mod && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        return;
      }

      const k = e.key.toLowerCase();

      // ---- Modifier shortcuts ----
      if (mod) {
        switch (k) {
          case "o":
            e.preventDefault();
            void openFiles();
            return;
          case "s":
            e.preventDefault();
            openDialog("export");
            return;
          case "f":
            e.preventDefault();
            openDialog("search");
            return;
          case "p":
            e.preventDefault();
            window.print();
            return;
          case "z":
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            return;
          case "y":
            e.preventDefault();
            redo();
            return;
          case "c":
            e.preventDefault();
            clipboard = selectedAnnos();
            if (clipboard.length) st.toast(clipboard.length + " copied", "success");
            return;
          case "v": {
            if (!clipboard.length) return;
            e.preventDefault();
            const docId = st.activeId;
            if (!docId) return;
            pushHistory();
            for (const a of clipboard) {
              const copy = JSON.parse(JSON.stringify(a)) as Annotation;
              (copy as { id: string }).id = "cp_" + Math.random().toString(36).slice(2, 9);
              (copy as { z?: number }).z = undefined;
              if ("x" in copy && typeof (copy as { x: number }).x === "number") (copy as { x: number }).x += 0.03;
              if ("y" in copy && typeof (copy as { y: number }).y === "number") (copy as { y: number }).y += 0.03;
              if ("rect" in copy && (copy as { rect?: { x: number; y: number } }).rect) {
                (copy as unknown as { rect: { x: number; y: number } }).rect.x += 0.03;
                (copy as unknown as { rect: { x: number; y: number } }).rect.y += 0.03;
              }
              st.addAnnotation(docId, copy);
            }
            return;
          }
          case "0":
            e.preventDefault();
            if (st.activeId) st.setZoom(st.activeId, 1);
            return;
          case "=":
          case "+":
            e.preventDefault();
            if (st.activeId) st.setZoom(st.activeId, (st.zoom[st.activeId] ?? 1) * 1.15);
            return;
          case "-":
            e.preventDefault();
            if (st.activeId) st.setZoom(st.activeId, (st.zoom[st.activeId] ?? 1) / 1.15);
            return;
        }
        return;
      }

      // ---- Plain keys ----
      switch (e.key) {
        case "Delete":
        case "Backspace": {
          const sel = st.selection;
          if (sel && sel.ids.length) {
            e.preventDefault();
            pushHistory();
            sel.ids.forEach((id) => st.removeAnnotation(sel.docId, id));
            st.setSelection(null);
          }
          return;
        }
        case "ArrowRight":
        case "ArrowDown": {
          const doc = st.activeId ? st.docs[st.activeId] : null;
          if (!doc) return;
          if (e.shiftKey) return;
          return;
        }
        case "?":
          openDialog("shortcuts");
          return;
      }

      switch (k) {
        case "v":
          st.setTool("select");
          break;
        case "t":
          st.setTool("text");
          break;
        case "h":
          st.setTool("highlight");
          break;
        case "u":
          st.setTool("underline");
          break;
        case "g":
          st.setGridView(!st.gridView);
          break;
        case "d":
          st.setTool("draw");
          break;
        case "n":
          st.setTool("note");
          break;
        case "r":
          st.setTool("rect");
          break;
        case "e":
          st.setTool("ellipse");
          break;
        case "s":
          st.setTool("signature");
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-record history on every changed doc state (cheap structural key).
  useEffect(() => {
    prevSnap = snap();
    const unsub = useStore.subscribe(() => {
      if (suppress) return;
      // defer so a burst of synchronous set() calls records a single step
      setTimeout(() => pushHistory(), 0);
    });
    return unsub;
  }, []);
}
