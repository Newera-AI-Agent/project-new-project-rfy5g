export const uid = (prefix = "id"): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full || "000000", 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Normalize a rect drawn in any direction to positive width/height. */
export function normRect(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

export function intersectRect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

export const STAMP_TEMPLATES = ["Approved", "Draft", "Confidential", "Reviewed", "Paid", "Void", "Received"];

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function haptic(ms: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      // @ts-ignore vibrate exists on navigator
      navigator.vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    // @ts-ignore
    t = setTimeout(() => fn(...args), wait);
  };
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  const attr = el.getAttribute?.("contenteditable");
  return attr === "" || attr === "true" || attr === "plaintext-only";
}

export function pageDims(
  page: { width?: number; height?: number; rotation?: number },
  fallbackW = 612,
  fallbackH = 792,
) {
  const w = page.width || fallbackW;
  const h = page.height || fallbackH;
  const rotation = Number(page.rotation) || 0;
  const rotated = rotation % 180 !== 0;
  return rotated ? { w: h, h: w } : { w, h };
}
