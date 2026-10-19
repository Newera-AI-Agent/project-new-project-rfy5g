"use client";

import type { ImageAnno, SavedSignature } from "@/lib/types";

/**
 * A tiny module-level bus for "place this image / stamp / signature next click".
 * The ToolPanel sets a pending asset, the AnnotationLayer consumes it on the
 * next pointer-down. Kept outside the store because it is transient and
 * carries a big data URL that we never want serialized.
 */
export type PendingAsset =
  | { kind: "image" | "stamp"; src: string; label?: string }
  | { kind: "signature"; src: string; label: string };

let pending: PendingAsset | null = null;
const listeners = new Set<(p: PendingAsset | null) => void>();

export function setPendingAsset(p: PendingAsset | null) {
  pending = p;
  listeners.forEach((l) => l(p));
}

export function getPendingAsset(): PendingAsset | null {
  return pending;
}

export function subscribePendingAsset(fn: (p: PendingAsset | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function pendingFromSignature(sig: SavedSignature): PendingAsset {
  return { kind: "signature", src: sig.src, label: sig.label };
}

export function pendingFromStamp(label: string, color: string): PendingAsset {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80">` +
    `<rect x="4" y="4" width="232" height="72" rx="10" fill="none" stroke="${color}" stroke-width="4"/>` +
    `<text x="120" y="50" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" ` +
    `text-anchor="middle" fill="${color}">${escapeXml(label)}</text></svg>`;
  return {
    kind: "stamp",
    label,
    src: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg))),
  };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string));
}

/** Convert a raster file into a data URL (used when stamping images). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export type { ImageAnno };