"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilePlus2,
  FileText,
  Layers,
  PenLine,
  ShieldCheck,
  Sparkles,
  Upload,
  WifiOff,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { loadBytesToDoc, addRecent, getRecent } from "@/lib/loader";
import { openPdfFiles } from "@/lib/fileOpen";

const FEATURES = [
  { icon: Layers, title: "Multi-document tabs", body: "Open many PDFs at once, drag to reorder, split-screen on desktop, swipe on mobile." },
  { icon: PenLine, title: "Annotations & forms", body: "Highlight, draw, shapes, sticky notes, AcroForm fill and e-signatures." },
  { icon: Sparkles, title: "On-device OCR & AI", body: "Tesseract WASM OCR, PII auto-redaction, summarise and chat with your document." },
  { icon: ShieldCheck, title: "Private by design", body: "Nothing is uploaded. Every byte is processed locally in your browser." },
];

export default function Landing() {
  const addDoc = useStore((s) => s.addDoc);
  const toast = useStore((s) => s.toast);
  const setBusy = useStore((s) => s.setBusy);
  const [recent, setRecent] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(getRecent());
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      setBusy("Reading " + arr.length + " file(s)…");
      for (const file of arr) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { doc } = await loadBytesToDoc(file.name, bytes);
          addDoc(doc);
          addRecent(file.name);
          toast("Opened " + file.name, "success");
        } catch (e: any) {
          if (String(e?.message) === "PDF_PASSWORD_REQUIRED") {
            const pw = window.prompt("This PDF is password protected. Enter password for " + file.name);
            if (pw) {
              try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const { doc } = await loadBytesToDoc(file.name, bytes, pw);
                addDoc(doc);
                toast("Unlocked " + file.name, "success");
              } catch {
                toast("Wrong password for " + file.name, "error");
              }
            }
          } else {
            toast("Could not open " + file.name, "error");
          }
        }
      }
      setBusy(null);
      setRecent(getRecent());
    },
    [addDoc, toast, setBusy],
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] shadow-lg">
            <FileText size={19} />
          </div>
          <span className="text-lg font-semibold tracking-tight">PdfEditz</span>
        </div>
        <span
          className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-soft sm:flex"
          title="All processing happens locally"
        >
          <WifiOff size={13} /> 100% offline &amp; client-side
        </span>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-16">
        <section className="pt-6 text-center sm:pt-14">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line surface px-3.5 py-1.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            No uploads · No accounts · Works offline
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            The PDF editor that
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-violet-500 bg-clip-text text-transparent"> never uploads your files</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-soft sm:text-lg">
            Edit, annotate, merge, split, sign, redact, OCR and compress PDFs entirely on your device. Mobile-first, installable as an app, and blazing fast thanks to off-thread WebAssembly rendering.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--accent-ink)] shadow-lg transition active:scale-[0.98] sm:w-auto"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={18} /> Open PDFs
            </button>
            <button
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-line surface px-6 py-3 text-base font-semibold transition active:scale-[0.98] sm:w-auto"
              onClick={async () => {
                const files = await openPdfFiles();
                if (files?.length) handleFiles(files);
              }}
            >
              <FilePlus2 size={18} /> From disk
            </button>
          </div>
          <p className="mt-3 text-xs text-soft">PDF, and many image formats. Or drop files below.</p>
        </section>

        <section
          className={
            "mx-auto mt-10 max-w-3xl rounded-3xl border-2 border-dashed p-8 text-center transition sm:p-12 " +
            (drag ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-line surface")
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl surface-2">
            <Upload size={26} />
          </div>
          <h2 className="text-lg font-semibold">Drop your PDFs here</h2>
          <p className="mt-1.5 text-sm text-soft">
            Multiple files supported — each opens in its own tab and survives a refresh.
          </p>
          {recent.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-medium text-soft">Recent:</span>
              {recent.map((r) => (
                <span key={r} className="rounded-full border border-line px-2.5 py-1 text-xs text-soft">
                  {r}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line surface p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                <f.icon size={20} />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-soft">{f.body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-14 text-center text-xs text-soft">
          PdfEditz · client-side PDF workstation · built with Next.js
        </footer>
      </main>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/*"
        multiple
        hidden
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  );
}