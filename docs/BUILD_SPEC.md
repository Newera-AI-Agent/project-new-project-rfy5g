# PdfEditz component spec (for parallel implementers)

Stack: Next.js 15 App Router, static export, `'use client'` everywhere, Tailwind, Zustand store at `@/store/useStore`, types at `@/lib/types`, utils at `@/lib/utils`.

## Hard rules
- Every component file starts with `"use client";` and default-exports the component.
- Import store: `import { useStore } from "@/store/useStore";`
- Select state with `useStore(s => s.x)`; call actions the same way.
- No props on top-level panels/dialogs (they read the store). Exception: `AnnotationLayer` (props below).
- Dialogs open/close via `@/lib/dialogs`: `openDialog("export")`, `closeDialog("export")`, `const { open } = useDialog("export")`.
- Use `cn()` from `@/lib/utils`, `haptic()` from `@/lib/utils`, lucide-react icons.
- Style with the project classes: `surface`, `surface-2`, `border-line`, `text-soft`, `tool-btn`, and Tailwind. Dark mode via CSS vars — never hardcode light-only colors; use `surface`/`text-soft`/`border-line`.
- Modals: fixed inset-0, backdrop `bg-black/50 backdrop-blur-sm`, panel `surface` rounded-2xl border border-line, `animate-fade-in`. Close on backdrop click + Esc.
- Mobile-first: min 44px touch targets, `md:` breakpoints for desktop.
- TypeScript strict — no `any` leaks that break `tsc --noEmit` (use `unknown` + casts). Must pass `npx tsc --noEmit`.

## Store API (src/store/useStore.ts)
State:
```
docs: Record<string, PdfDoc>; order: string[]; activeId: string|null; splitId: string|null;
tool: ToolId; settings: ToolSettings; zoom: Record<string,number>; scrollPos: Record<string,number>;
scrollMode: "vertical"|"horizontal"|"single"; theme: "light"|"dark"|"sepia"; highContrast: boolean;
sidebarOpen: boolean; gridView: boolean; tabsBarVisible: boolean;
selection: {docId:string; ids:string[]}|null; searchQuery: string; searchHits: SearchHit[]; searching: boolean;
busy: string|null; toasts: Toast[]; signatures: SavedSignature[]; hydrated: boolean;
```
Actions:
```
addDoc(doc: PdfDoc); removeDoc(id); closeAll(); setActive(id); setSplit(id|null);
moveTab(from:number,to:number); renameDoc(id,name); patchDoc(id, patch: Partial<PdfDoc>);
setPageOrder(id, pages: PageMeta[]); rotatePages(id, positions:number[], delta:number);
deletePages(id, positions:number[]); cropPage(id, position:number, crop: Rect|undefined);
insertBlank(id, at:number, w?:number, h?:number); addPagesFromDoc(targetId, source: PdfDoc, positions:number[], at:number);
addAnnotation(docId, anno: Annotation); updateAnnotation(docId, id, patch: Partial<Annotation>);
removeAnnotation(docId, id); clearAnnotations(docId, pageIndex?:number); redactAll(docId);
setTool(t: ToolId); patchSettings(p: Partial<ToolSettings>); setZoom(docId, z:number); setScrollPos(docId,y:number);
setScrollMode(m); setTheme(t); toggleContrast(); setSidebar(v); setGridView(v); setTabsBar(v); setSelection(s);
runSearch(q: string): Promise<void>; clearSearch(); setBusy(b: string|null); toast(msg, kind?: "info"|"success"|"error"); dismissToast(id);
loadSignatures(): Promise<void>; saveSignature(sig: SavedSignature): Promise<void>; deleteSignature(id): Promise<void>;
setFields(docId, fields: FormFieldInfo[]); setOutline(docId, outline: OutlineItem[]);
hydrate(): Promise<void>; persistWorkspace(): Promise<void>; persistDoc(id): Promise<void>;
```
`ToolSettings = { color, opacity, strokeWidth, fontSize, font:"Helvetica"|"TimesRoman"|"Courier", bold, fill, stampText, stampColor }`
`Toast = { id, msg, kind }`  `SearchHit = { docId, pageIndex, snippet, index }`

## Lib helpers
- `@/lib/utils`: `uid(prefix?)`, `clamp(v,min,max)`, `cn(...)`, `formatBytes(n)`, `hexToRgb(hex)`, `normRect(x1,y1,x2,y2)`, `intersectRect(a,b)`, `STAMP_TEMPLATES`, `downloadBlob(blob,name)`, `haptic(ms?)`, `debounce(fn,wait?)`, `isEditableTarget(el)`, `pageDims(page,w?,h?)`.
- `@/lib/fileOpen`: `openPdfFiles(): Promise<File[]|null>`, `saveBytes(name, bytes, suggested?): Promise<"picker"|"download">`, `supportsFsAccess()`.
- `@/lib/loader`: `loadBytesToDoc(name, bytes, password?): Promise<{doc: PdfDoc; encrypted: boolean}>`, `addRecent(name)`, `getRecent(): string[]`.
- `@/lib/pdfExport`: `buildPdf(src: PdfDoc, opts?: ExportOptions): Promise<Uint8Array>`, `mergeDocs(docs: PdfDoc[]): Promise<Uint8Array>`, `extractRange(src, positions:number[]): Promise<Uint8Array>`, `makeBlankPage(w?,h?): PageMeta`, `dataUrlToBytes(u)`.
  `ExportOptions = { applyRedactions?: boolean; flatten?: boolean; pageFilter?: (i:number)=>boolean }`
- `@/lib/pdfEngine`: `getPdfjs()`, `getCachedDoc(key, bytes): Promise<any>`, `dropCachedDoc(key)`, `renderPage(pdf, pageNumber, canvas, { scale, rotation?, dpr?, crop? }): Promise<{width,height}>`, `getPageText(pdf, n)`, `getPageTextString(pdf, n)`, `renderPageToDataUrl(pdf, n, width)`.
- `@/lib/dialogs`: `openDialog(name, open?, payload?)`, `closeDialog(name)`, `useDialog(name)`; `DialogName = export|signature|batch|shortcuts|fields|ai|search|outline|crophelp|password`.

## Types (@/lib/types)
Annotation union members: MarkupAnno(kind highlight|underline|strike|squiggly, rects:Rect[], color, opacity, text?), ShapeAnno(kind rect|ellipse, rect, stroke, fill, strokeWidth, opacity), LineAnno(kind line|arrow, x1,y1,x2,y2, stroke, strokeWidth, opacity), DrawAnno(kind draw, color, strokeWidth, opacity, paths:{x,y,p?}[][]), NoteAnno(kind note, x,y,color,author,body,replies[],createdAt,resolved?), TextAnno(kind text, x,y,text,fontSize,color,font,bold?,italic?,width?), ImageAnno(kind image|stamp, rect, src(dataURL), rotation, opacity, label?), RedactAnno(kind redact, rects, applied?). All have id,pageIndex,z,locked?.
Rect = {x,y,w,h} normalized 0..1 top-left. PageMeta={id,srcIndex,rotation,crop?,blank?,width?,height?}.
PdfDoc={id,name,bytes:ArrayBuffer,size,pageCount,pages:PageMeta[],annotations,outline,fields,encrypted?,dirty?}.
SavedSignature={id,kind:"draw"|"type",src,label,createdAt}. FormFieldInfo={name,type,value,options?,rects:{page,rect}[]}.

## Page↔viewport coordinate conversion
Annotations use normalized coords relative to the page's *CSS* box. In AnnotationLayer, cssW/cssH = current rendered page size in px. So `px = x*cssW`, `py = y*cssH`. Draw/markup tools capture pointer coords as `(clientX-rect.left)/rect.width` clamped 0..1.
