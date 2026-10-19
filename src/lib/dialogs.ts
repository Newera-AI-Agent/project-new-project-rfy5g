"use client";

import { useEffect, useState } from "react";

/** Names of app-level dialogs / panels that are toggled imperatively. */
export type DialogName =
  | "export"
  | "signature"
  | "batch"
  | "shortcuts"
  | "fields"
  | "ai"
  | "search"
  | "outline"
  | "crophelp"
  | "password";

const OPEN_EVENT = "pdfeditz-open-dialog";

/** Ask the app to show (or hide) a dialog. Safe to call from anywhere. */
export function openDialog(name: DialogName, open = true, payload?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { name, open, payload } }));
}

export function toggleDialog(name: DialogName) {
  openDialog(name, undefined as unknown as boolean);
}

/**
 * Subscribe to a dialog by name. Returns the current open state plus any
 * payload that was attached to the most recent open request.
 */
export function useDialog(name: DialogName): { open: boolean; payload: unknown } {
  const [state, setState] = useState<{ open: boolean; payload: unknown }>({ open: false, payload: null });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: DialogName; open?: boolean; payload?: unknown };
      if (!detail || detail.name !== name) return;
      setState((prev) => ({
        open: typeof detail.open === "boolean" ? detail.open : !prev.open,
        payload: detail.payload ?? null,
      }));
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, [name]);

  return state;
}

/** Close a dialog from inside it. */
export function closeDialog(name: DialogName) {
  openDialog(name, false);
}