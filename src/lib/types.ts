// Core domain types for PdfEditz — a 100% client-side PDF editor.

export type ToolId =
  | "select"
  | "text"
  | "highlight"
  | "underline"
  | "strike"
  | "squiggly"
  | "draw"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "note"
  | "image"
  | "stamp"
  | "signature"
  | "redact"
  | "crop"
  | "eraser";

export type ScrollMode = "vertical" | "horizontal" | "single";
export type ThemeName = "light" | "dark" | "sepia";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Normalized (0..1) rectangle relative to page size, top-left origin. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BaseAnno {
  id: string;
  pageIndex: number;
  /** Stacking order. */
  z: number;
  locked?: boolean;
}

export interface MarkupAnno extends BaseAnno {
  kind: "highlight" | "underline" | "strike" | "squiggly";
  color: string;
  opacity: number;
  /** One entry per text line/selection quad. */
  rects: Rect[];
  text?: string;
}

export interface ShapeAnno extends BaseAnno {
  kind: "rect" | "ellipse";
  rect: Rect;
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
}

export interface LineAnno extends BaseAnno {
  kind: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface DrawAnno extends BaseAnno {
  kind: "draw";
  color: string;
  strokeWidth: number;
  opacity: number;
  /** Each path is a series of normalized [x,y] points. */
  paths: { x: number; y: number; p?: number }[][];
}

export interface NoteAnno extends BaseAnno {
  kind: "note";
  x: number;
  y: number;
  color: string;
  author: string;
  body: string;
  replies: { id: string; author: string; body: string; at: number }[];
  createdAt: number;
  resolved?: boolean;
}

export interface TextAnno extends BaseAnno {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  font: "Helvetica" | "TimesRoman" | "Courier";
  bold?: boolean;
  italic?: boolean;
  width?: number;
}

export interface ImageAnno extends BaseAnno {
  kind: "image" | "stamp";
  rect: Rect;
  /** data URL (PNG/JPEG/SVG rasterized). */
  src: string;
  rotation: number;
  opacity: number;
  label?: string;
}

export interface RedactAnno extends BaseAnno {
  kind: "redact";
  rects: Rect[];
  /** When true the underlying content is removed on export. */
  applied?: boolean;
}

export type Annotation =
  | MarkupAnno
  | ShapeAnno
  | LineAnno
  | DrawAnno
  | NoteAnno
  | TextAnno
  | ImageAnno
  | RedactAnno;

export interface PageMeta {
  /** Stable id of the source page (used for reordering). */
  id: string;
  /** Index into the source PDF's pages. */
  srcIndex: number;
  rotation: number;
  /** Normalized crop box (fraction of page), default full page. */
  crop?: Rect;
  /** True for pages inserted as blanks. */
  blank?: boolean;
  width?: number;
  height?: number;
}

export interface OutlineItem {
  title: string;
  page: number;
  children?: OutlineItem[];
}

export interface FormFieldInfo {
  name: string;
  type: string;
  value: string;
  options?: string[];
  rects: { page: number; rect: Rect }[];
}

export interface PdfDoc {
  id: string;
  name: string;
  /** Original bytes — never mutated; edits are applied on export. */
  bytes: ArrayBuffer;
  size: number;
  pageCount: number;
  /** Ordered page list after manipulation. */
  pages: PageMeta[];
  annotations: Annotation[];
  outline: OutlineItem[];
  fields: FormFieldInfo[];
  encrypted?: boolean;
  dirty?: boolean;
}

export interface SavedSignature {
  id: string;
  kind: "draw" | "type";
  src: string;
  label: string;
  createdAt: number;
}

/** Serialized, IndexedDB-friendly workspace state. */
export interface PersistedDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  size: number;
  pageCount: number;
  pages: PageMeta[];
  annotations: Annotation[];
  outline: OutlineItem[];
  fields: FormFieldInfo[];
  dirty?: boolean;
}
