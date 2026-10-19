"use client";

import { CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import { useStore } from "@/store/useStore";

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const busy = useStore((s) => s.busy);

  return (
    <>
      {busy && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3">
          <div className="flex items-center gap-2.5 rounded-full border border-line surface px-4 py-2 text-sm shadow-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {busy}
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-3 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="animate-slide-up pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-line surface px-3.5 py-2.5 text-sm shadow-xl"
          >
            {t.kind === "success" && <CheckCircle2 size={16} className="text-emerald-500" />}
            {t.kind === "error" && <AlertTriangle size={16} className="text-rose-500" />}
            {t.kind === "info" && <Info size={16} className="text-[var(--accent)]" />}
            <span className="flex-1">{t.msg}</span>
            <button className="rounded p-1 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}