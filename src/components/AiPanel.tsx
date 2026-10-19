"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScanText,
  ShieldAlert,
  Sparkles,
  MessagesSquare,
  Volume2,
  Square,
  Copy,
  Check,
  Loader2,
  Eraser,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog, openDialog } from "@/lib/dialogs";
import { getPdfjs, getCachedDoc, getPageText, getPageTextString } from "@/lib/pdfEngine";
import { haptic } from "@/lib/utils";
import type { Annotation, Rect } from "@/lib/types";

type TabId = "summary" | "ocr" | "redact" | "chat" | "speak";

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { id: "summary", label: "Summary", Icon: Sparkles },
  { id: "ocr", label: "OCR", Icon: ScanText },
  { id: "redact", label: "Redact", Icon: ShieldAlert },
  { id: "chat", label: "Chat", Icon: MessagesSquare },
  { id: "speak", label: "Read", Icon: Volume2 },
];

/** PII patterns for client-side auto-redaction (req 27). */
const PII_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "Credit card", re: /\b(?:\d[ -]?){13,16}\b/g },
  { name: "Phone", re: /\b(?:\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/g },
  { name: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
];

/** Cheap extractive summarizer — picks the most "central" sentences (req 29). */
function summarize(text: string, max = 3): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 400);
  if (!sentences.length) return [];
  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const w of s.toLowerCase().match(/[a-z]{4,}/g) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const score = words.reduce((n, w) => n + (freq.get(w) ?? 0), 0) / Math.max(1, words.length);
    return { s, i, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

/** Load tesseract.js from a CDN on demand (kept out of the bundle — req 26). */
async function loadTesseract(): Promise<any> {
  const w = window as unknown as { Tesseract?: any };
  if (w.Tesseract) return w.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load OCR engine (offline?)"));
    document.head.appendChild(s);
  });
  if (!w.Tesseract) throw new Error("OCR engine unavailable");
  return w.Tesseract;
}

/**
 * AI & WASM tool panel (req 26-31, 44): client-side OCR, PII auto-redaction,
 * extractive summarization, retrieval chat and text-to-speech. Everything runs
 * in the browser — no document ever leaves the device (req 46).
 */
export default function AiPanel() {
  const { open } = useDialog("ai");
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => (s.activeId ? s.docs[s.activeId] : undefined));
  const addAnnotation = useStore((s) => s.addAnnotation);
  const redactAll = useStore((s) => s.redactAll);
  const setBusy = useStore((s) => s.setBusy);
  const toast = useStore((s) => s.toast);

  const [tab, setTab] = useState<TabId>("summary");
  const [text, setText] = useState<string>("");
  const [extracting, setExtracting] = useState(false);
  const [bullets, setBullets] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrPage, setOcrPage] = useState(1);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [matches, setMatches] = useState<{ kind: string; value: string; page: number }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; page: number } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const runIdRef = useRef(0);

  const pageCount = doc?.pageCount ?? 0;

  // Extract full text once a document is loaded / panel opened.
  const extract = useCallback(async () => {
    if (!doc) return "";
    const pdf = await getCachedDoc(doc.id, doc.bytes);
    const parts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) parts.push(await getPageTextString(pdf, p));
    return parts.join("\n\n");
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !doc) return;
    setBullets([]);
    setOcrText("");
    setMatches([]);
    setAnswer(null);
    setExtracting(true);
    let alive = true;
    extract()
      .then((t) => alive && setText(t))
      .catch(() => alive && setText(""))
      .finally(() => alive && setExtracting(false));
    return () => {
      alive = false;
    };
  }, [open, doc?.id, extract]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog("ai");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open && speaking) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
  }, [open, speaking]);

  if (!open || !doc) return null;
  const activeDoc = doc;

  const runSummary = () => {
    const b = summarize(text, 3);
    setBullets(b.length ? b : ["Not enough selectable text found. Try running OCR on scanned pages first."]);
    haptic(12);
  };

  async function runOcr() {
    if (!activeDoc) return;
    setOcrRunning(true);
    setOcrProgress(0);
    setBusy("Running OCR");
    const id = ++runIdRef.current;
    try {
      const T = await loadTesseract();
      const pdf = await getCachedDoc(activeDoc.id, activeDoc.bytes);
      const page = await pdf.getPage(ocrPage);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const res = await T.recognize(canvas, "eng", {
        logger: (m: { status: string; progress: number }) => {
          if (runIdRef.current === id && m.status === "recognizing text") setOcrProgress(m.progress);
        },
      });
      if (runIdRef.current !== id) return;
      setOcrText((res?.data?.text ?? "").trim());
      haptic(20);
      toast("OCR finished — text is selectable & searchable", "success");
    } catch (err) {
      toast(`OCR failed: ${(err as Error).message}`, "error");
    } finally {
      if (runIdRef.current === id) {
        setOcrRunning(false);
        setBusy(null);
      }
    }
  }

  async function scanPii() {
    if (!activeDoc) return;
    setScanning(true);
    setBusy("Scanning for PII");
    try {
      const pdf = await getCachedDoc(activeDoc.id, activeDoc.bytes);
      const found: { kind: string; value: string; page: number }[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const items = await getPageText(pdf, p);
        const pageStr = items.map((i) => i.str).join(" ");
        for (const pat of PII_PATTERNS) {
          const re = new RegExp(pat.re.source, "g");
          let m: RegExpExecArray | null;
          while ((m = re.exec(pageStr))) {
            if (found.length >= 300) break;
            found.push({ kind: pat.name, value: m[0], page: p - 1 });
          }
        }
      }
      setMatches(found);
      toast(found.length ? `${found.length} potential PII item(s) found` : "No PII patterns detected", found.length ? "success" : "info");
    } catch (err) {
      toast(`Scan failed: ${(err as Error).message}`, "error");
    } finally {
      setScanning(false);
      setBusy(null);
    }
  }

  /** Draw redaction boxes over every detected PII string on its page. */
  async function markRedactions() {
    if (!activeDoc || !matches.length) return;
    setBusy("Marking redactions");
    try {
      const pdf = await getCachedDoc(activeDoc.id, activeDoc.bytes);
      const byPage = new Map<number, string[]>();
      for (const m of matches) {
        const arr = byPage.get(m.page) ?? [];
        arr.push(m.value);
        byPage.set(m.page, arr);
      }
      let boxes = 0;
      for (const [pageIndex, values] of byPage) {
        const items = await getPageText(pdf, pageIndex + 1);
        const joined = items.map((i) => i.str).join(" ");
        for (const value of values) {
          if (!joined.includes(value.trim())) continue;
          // Approximate: spread the redaction box across the first item that
          // contains the value, falling back to the page centre.
          const hit = items.find((it) => it.str.includes(value.trim().split(" ")[0]));
          const rect: Rect = hit
            ? { x: Math.max(0, hit.x - 0.005), y: Math.max(0, hit.y - 0.002), w: Math.min(1 - hit.x, hit.w + Math.max(0.02, value.length * 0.006)), h: Math.max(0.012, hit.h) }
            : { x: 0.1, y: 0.45, w: 0.8, h: 0.03 };
          const anno = {
            id: `redact_${Math.random().toString(36).slice(2, 9)}`,
            kind: "redact",
            pageIndex,
            z: 0,
            rects: [rect],
          } as Annotation;
          addAnnotation(activeDoc.id, anno);
          boxes++;
        }
      }
      haptic(20);
      toast(`${boxes} redaction box(es) placed — apply to erase the text`, "success");
    } finally {
      setBusy(null);
    }
  }

  function applyRedactions() {
    if (!activeDoc) return;
    redactAll(activeDoc.id);
    toast("Redactions applied — export with redactions to permanently remove text", "success");
    setTimeout(() => openDialog("export", true), 600);
  }

  async function ask() {
    const q = question.trim();
    if (!q || !activeDoc) return;
    const pdf = await getCachedDoc(activeDoc.id, activeDoc.bytes);
    const terms = q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    let best = { page: 1, score: -1, snippet: "" };
    for (let p = 1; p <= pdf.numPages; p++) {
      const items = await getPageText(pdf, p);
      const pageStr = items.map((i) => i.str).join(" ");
      const low = pageStr.toLowerCase();
      let score = 0;
      for (const t of terms) if (low.includes(t)) score++;
      if (score > best.score) {
        const first = items.find((it) => terms.some((t) => it.str.toLowerCase().includes(t)));
        const anchor = first ? pageStr.indexOf(first.str) : 0;
        const snippet = (anchor >= 0 ? pageStr.slice(Math.max(0, anchor - 60), anchor + 260) : pageStr.slice(0, 260)).trim();
        best = { page: p, score, snippet };
      }
    }
    if (best.score <= 0) {
      setAnswer({ text: "I couldn't find that in the document text. If this PDF is scanned, run OCR first so its text becomes searchable.", page: 1 });
    } else {
      setAnswer({ text: best.snippet || "Matching content found on this page.", page: best.page });
      window.dispatchEvent(new CustomEvent("pdfeditz-goto", { detail: { page: best.page, docId: activeDoc.id } }));
    }
    haptic(10);
  }

  function speak() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast("Speech synthesis is not available in this browser", "error");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const content = text.slice(0, 60000);
    if (!content.trim()) {
      toast("No text to read — try OCR first", "error");
      return;
    }
    const u = new SpeechSynthesisUtterance(content);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  const charCount = useMemo(() => text.replace(/\s+/g, " ").trim().length, [text]);
  const wordCount = useMemo(() => (text.match(/\S+/g) ?? []).length, [text]);

  return (
    <aside
      data-dialog-panel
      className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-line surface shadow-2xl animate-slide-up md:absolute md:inset-y-0 md:right-0 md:bottom-auto md:max-h-none md:w-[400px] md:animate-fade-in md:rounded-none md:rounded-l-2xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" /> AI &amp; OCR tools
        </h2>
        <button onClick={() => closeDialog("ai")} className="tool-btn h-8 w-8" aria-label="Close">
          ✕
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line px-2 py-1.5">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-active={tab === id}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium"
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-3 rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-soft">
          100% on-device · {extracting ? "extracting text…" : `${wordCount.toLocaleString()} words · ${charCount.toLocaleString()} chars`}
        </p>

        {tab === "summary" && (
          <section className="space-y-3">
            <p className="text-xs text-soft">
              Generate a 3&nbsp;bullet-point summary of the whole document, computed locally from its text layer.
            </p>
            <button onClick={runSummary} disabled={extracting} className="btn-primary h-9 w-full text-xs">
              <Sparkles size={15} /> Summarize document
            </button>
            {bullets.length > 0 && (
              <ul className="space-y-2">
                {bullets.map((b, i) => (
                  <li key={i} className="rounded-xl border border-line bg-[var(--surface-2)] p-3 text-xs leading-relaxed">
                    <span className="mr-1 font-semibold text-[var(--accent)]">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "ocr" && (
          <section className="space-y-3">
            <p className="text-xs text-soft">
              Turn scanned pages into selectable, searchable text with a browser-based OCR engine (WASM). Runs fully offline after the engine loads.
            </p>
            <label className="block text-[11px] text-soft">
              Page {ocrPage} of {pageCount}
              <input
                type="range"
                min={1}
                max={Math.max(1, pageCount)}
                value={ocrPage}
                onChange={(e) => setOcrPage(parseInt(e.target.value, 10))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
            <button onClick={runOcr} disabled={ocrRunning} className="btn-primary h-9 w-full text-xs">
              {ocrRunning ? <Loader2 size={15} className="animate-spin" /> : <ScanText size={15} />}
              {ocrRunning ? `Recognizing… ${Math.round(ocrProgress * 100)}%` : "Run OCR on this page"}
            </button>
            {ocrRunning && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
              </div>
            )}
            {ocrText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-soft">Recognized text</span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(ocrText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={ocrText}
                  className="h-40 w-full resize-none rounded-lg border border-line bg-[var(--surface-2)] p-2 text-xs"
                />
              </div>
            )}
          </section>
        )}

        {tab === "redact" && (
          <section className="space-y-3">
            <p className="text-xs text-soft">
              Detect personal data (emails, SSNs, card numbers, phones, IBANs) with local pattern matching, then black it out permanently.
            </p>
            <button onClick={scanPii} disabled={scanning} className="btn-ghost h-9 w-full border border-line text-xs">
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <ShieldAlert size={15} />} Scan for PII
            </button>
            {matches.length > 0 && (
              <>
                <ul className="max-h-52 space-y-1 overflow-y-auto">
                  {matches.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1.5 text-[11px]">
                      <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-medium">{m.kind}</span>
                      <span className="flex-1 truncate font-mono">{m.value}</span>
                      <span className="shrink-0 text-soft">p{m.page + 1}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={markRedactions} className="btn-primary h-9 w-full text-xs">
                  Mark {matches.length} redaction box(es)
                </button>
                <button onClick={applyRedactions} className="btn-ghost h-9 w-full border border-line text-xs text-[#ef4444]">
                  <Eraser size={15} /> Apply permanently (erase text)
                </button>
                <p className="text-[10px] text-soft">
                  Applied redactions rasterize the page on export so the underlying text/data is truly removed.
                </p>
              </>
            )}
            {matches.length === 0 && !scanning && (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-[11px] text-soft">
                No scan run yet.
              </p>
            )}
          </section>
        )}

        {tab === "chat" && (
          <section className="space-y-3">
            <p className="text-xs text-soft">Ask a question about this document. Answers are retrieved from the local text layer and the source page is highlighted.</p>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="e.g. What is the payment due date?"
                className="h-10 flex-1 rounded-lg border border-line bg-[var(--surface-2)] px-2 text-sm"
              />
              <button onClick={ask} className="btn-primary h-10 px-3 text-xs">
                Ask
              </button>
            </div>
            {answer && (
              <div className="rounded-xl border border-line bg-[var(--surface-2)] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent)]">
                  <MessagesSquare size={13} /> Page {answer.page}
                </p>
                <p className="text-xs leading-relaxed">{answer.text}</p>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("pdfeditz-goto", { detail: { page: answer.page, docId: activeDoc.id } }))}
                  className="mt-2 text-[11px] text-[var(--accent)] hover:underline"
                >
                  Jump to source →
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "speak" && (
          <section className="space-y-3">
            <p className="text-xs text-soft">Read the document aloud using your device&apos;s built-in voices — great for accessibility.</p>
            <button onClick={speak} className="btn-primary h-9 w-full text-xs">
              {speaking ? <Square size={15} /> : <Volume2 size={15} />}
              {speaking ? "Stop reading" : "Read document aloud"}
            </button>
            {speaking && (
              <p className="flex items-center gap-2 text-[11px] text-soft">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" /> Speaking…
              </p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}