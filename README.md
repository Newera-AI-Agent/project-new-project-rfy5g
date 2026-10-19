# PdfEditz — 100% client-side, mobile-first PDF editor

A full-featured PDF editor that runs **entirely in the browser**. No file ever
leaves the device: rendering, editing, OCR, redaction and export all happen
locally via WebAssembly + the File/IndexedDB APIs. Built with **Next.js 15
(App Router, static export)** and deployable to Cloudflare Pages.

- **Live:** https://newera-pdfeditz.pages.dev
- **Stack:** Next.js 15 · React 19 · TypeScript (strict) · Tailwind · Zustand · pdf.js · pdf-lib

---

## What it does (feature map)

### Multi-document workspace
| # | Feature |
|---|---------|
| 1 | Tabbed interface — open/switch multiple PDFs, drag-to-reorder tabs |
| 2 | Split-screen view (side-by-side on desktop, swipe on mobile) |
| 3 | Cross-document drag & drop of pages between documents |
| 4 | Batch processing across all open documents (watermark / compress / delete) |
| 5 | Session persistence — tabs, zoom, scroll & selection auto-saved to IndexedDB |
| 6 | Merge multiple open PDFs / uploads into one |
| 7 | Split — extract page ranges into a brand-new tab |

### Editing & annotation
| # | Feature |
|---|---------|
| 8 | WYSIWYG text editing (font, size, colour, content) via pdf-lib overlay |
| 9 | Highlight / strikethrough / underline / squiggly with colour pickers |
| 10 | Freehand drawing with stylus (pointer pressure) + mouse smoothing |
| 11 | Rectangles, circles, lines, arrows — fill / stroke / opacity |
| 12 | Sticky notes with threaded replies |
| 13 | Image stamping (PNG/JPG/SVG) with crop, resize, rotate handles |
| 14 | Custom stamps (Approved / Draft / Confidential …) saved locally |

### Page manipulation
| # | Feature |
|---|---------|
| 15 | Visual page thumbnails — sidebar on desktop, bottom sheet on mobile |
| 16 | Drag-and-drop page reordering |
| 17 | Rotate 90° / delete single or multiple pages |
| 18 | Visual crop box |
| 19 | Long-press / right-click a page to extract it as a standalone PDF |
| 20 | Insert custom-sized blank pages anywhere |

### Forms & signatures
| # | Feature |
|---|---------|
| 21 | AcroForm auto-detection with inline typing / dropdowns |
| 22 | Touch-optimised signature pad (smoothed paths) |
| 23 | Typed cursive signatures (multiple font styles) |
| 24 | Saved signatures / initials in local storage |
| 25 | Form data export/import as JSON or XFDF |

### Next-gen (AI & WASM)
| # | Feature |
|---|---------|
| 26 | Client-side OCR (Tesseract.js WASM) → selectable text layer |
| 27 | AI auto-redaction — regex + heuristic PII detection (SSN, email, card) |
| 28 | Chat with PDF — local retrieval, answers highlight source text |
| 29 | AI summarisation — 3-bullet summary of doc or page range |
| 30 | Smart form auto-fill from a saved local profile |
| 31 | Background compression via WASM (image down-sampling, metadata strip) |

### Mobile & desktop UX
| # | Feature |
|---|---------|
| 32 | Responsive workspace — docked sidebar vs. bottom-sheet drawer |
| 33 | Touch-optimised hit targets (≥44px) on mobile |
| 34 | Pinch-to-zoom & pan via CSS transforms |
| 35 | Context-aware toolbars (selection drives the toolbar) |
| 36 | Full keyboard shortcut suite (Ctrl+Z/C/V/Del …) |
| 37 | Haptic feedback (Vibration API) on snaps & drops |
| 38 | Dark / Light / Sepia themes |
| 39 | Off-main-thread page rendering (Web Worker + pdf.js) |

### Navigation & accessibility
| # | Feature |
|---|---------|
| 40 | Global multi-document search with highlighted results |
| 41 | Outline / bookmark detection + navigation |
| 42 | Page grid view |
| 43 | Vertical / horizontal / single-page scroll modes |
| 44 | Text-to-speech via the Web Speech API |
| 45 | High-contrast mode (WCAG 2.1 AA) |

### Security, export & architecture
| # | Feature |
|---|---------|
| 46 | 100% client-side processing — no server round-trips, ever |
| 47 | Password add / change / remove locally |
| 48 | True redaction — underlying text/graphics removed on export |
| 49 | Export to PNG / JPEG / SVG, or extract text |
| 50 | Print to PDF via the native dialog |
| 51 | Auto-save to IndexedDB every few seconds |
| 52 | PWA — installable, offline app shell, standalone window |
| 53 | File System Access API — open/save directly to disk on desktop |
| 54 | Web Share API — send edited PDFs to other apps on mobile |

---

## Architecture & decisions

- **Static export (`output: 'export'`).** The whole app is a client-rendered SPA
exported to `out/`. `next.config.mjs` disables the Node `canvas` shim
(`resolve.alias.canvas = false`) so pdf.js bundles cleanly for the browser.
- **State:** one Zustand store (`src/store/useStore.ts`) owns documents, tabs,
  annotations, tools, view and history (undo/redo). Components stay thin.
- **Rendering:** pdf.js renders pages in a Web Worker (`pdf.worker.min.mjs`,
copied at build time by `scripts/copy-worker.mjs`). Annotation overlays are a
separate DOM layer using **normalised coordinates relative to the page CSS box**,
so zoom/rotation never desync them.
- **Export:** pdf-lib composes the final PDF — copying source pages, drawing
  vector annotations, embedding text/images, baking stamps/watermarks, and
  **rasterising pages that carry applied redactions** so the underlying text is
truly gone (not just covered).
- **Persistence:** IndexedDB database `pdfeditz` (v1) with stores `docs`,
  `meta`, `signatures` (`src/lib/persistence.ts`). Original bytes are stored
  once; edits are replayed on load.
- **PWA:** `public/sw.js` precaches the app shell and uses
  stale-while-revalidate for same-origin assets; it deliberately never caches
  PDF bytes (those live in IndexedDB).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm test           # vitest (23 tests)
npm run build      # static export into out/
```

## Deploy

`out/` is a plain static bundle — deploy to any static host. Cloudflare Pages:

```bash
npm run build
# upload the out/ directory
```
