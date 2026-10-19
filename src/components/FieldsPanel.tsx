"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, FileUp, ListChecks, RefreshCw, Wand2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog } from "@/lib/dialogs";
import {
  detectFields,
  applyFields,
  toJson,
  fromJson,
  toXfdf,
  fromXfdf,
} from "@/lib/formio";
import { downloadBlob } from "@/lib/utils";

type Profile = { name: string; email: string; phone: string; address: string; company: string; city: string; zip: string };
const PROFILE_KEY = "pdfeditz-profile";
const EMPTY: Profile = { name: "", email: "", phone: "", address: "", company: "", city: "", zip: "" };

/** AcroForm detection + fill + JSON/XFDF data import-export (req 21, 25, 30). */
export default function FieldsPanel() {
  const { open } = useDialog("fields");
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => (s.activeId ? s.docs[s.activeId] : undefined));
  const patchDoc = useStore((s) => s.patchDoc);
  const toast = useStore((s) => s.toast);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile>(EMPTY);

  const fields = doc?.fields ?? [];

  useEffect(() => {
    if (open) setValues((doc?.fields ?? []).reduce((a, f) => ({ ...a, [f.name]: f.value ?? "" }), {}));
  }, [open, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setProfile({ ...EMPTY, ...(JSON.parse(raw) as Profile) });
    } catch {
      /* ignore */
    }
  }, [open]);

  const filled = useMemo(() => Object.values(values).filter((v) => v && v !== "false").length, [values]);

  if (!open || !doc) return null;

  async function scan() {
    if (!doc) return;
    setBusy(true);
    const detected = await detectFields(doc);
    setBusy(false);
    patchDoc(doc.id, { fields: detected, dirty: true });
    toast(detected.length ? `${detected.length} field(s) found` : "No AcroForm fields in this PDF", detected.length ? "success" : "info");
  }

  function set(name: string, v: string) {
    setValues((s) => ({ ...s, [name]: v }));
  }

  function autoFill() {
    if (!doc) return;
    const next = { ...values };
    let hits = 0;
    for (const f of doc.fields) {
      const n = f.name.toLowerCase();
      const map: [RegExp, string][] = [
        [/name/, profile.name],
        [/e-?mail/, profile.email],
        [/phone|tel|mobile/, profile.phone],
        [/address|street/, profile.address],
        [/company|organisation|organization|employer/, profile.company],
        [/city|town/, profile.city],
        [/zip|postal|postcode/, profile.zip],
      ];
      for (const [re, val] of map) {
        if (val && re.test(n) && !next[f.name]) {
          next[f.name] = val;
          hits++;
          break;
        }
      }
    }
    setValues(next);
    toast(hits ? `Auto-filled ${hits} field(s) from your profile` : "No matching fields for your profile", hits ? "success" : "info");
  }

  function saveProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    toast("Profile saved locally", "success");
  }

  async function apply() {
    if (!doc) return;
    setBusy(true);
    try {
      const bytes = await applyFields(doc, values);
      patchDoc(doc.id, { bytes: bytes.buffer as ArrayBuffer, size: bytes.byteLength, dirty: true });
      toast("Form values applied into the PDF", "success");
    } catch {
      toast("Could not apply form values", "error");
    } finally {
      setBusy(false);
    }
  }

  function exportData(kind: "json" | "xfdf") {
    if (!doc) return;
    const text = kind === "json" ? toJson(values) : toXfdf(values);
    const name = doc.name.replace(/\.pdf$/i, "") + (kind === "json" ? ".fields.json" : ".xfdf");
    downloadBlob(name, new Blob([text], { type: kind === "json" ? "application/json" : "application/vnd.adobe.xfdf" }));
    toast(`Exported ${kind.toUpperCase()}`, "success");
  }

  async function importData(file: File) {
    try {
      const text = await file.text();
      const parsed = /<xfdf/i.test(text) ? fromXfdf(text) : fromJson(text);
      setValues((s) => ({ ...s, ...parsed }));
      toast(`Imported ${Object.keys(parsed).length} value(s)`, "success");
    } catch {
      toast("That file could not be parsed", "error");
    }
  }

  return (
    <aside
      data-dialog-panel
      className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-line surface shadow-2xl animate-slide-up md:absolute md:inset-y-0 md:right-0 md:bottom-auto md:max-h-none md:w-[400px] md:animate-fade-in md:rounded-none md:rounded-l-2xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-[var(--accent)]" /> Form fields
        </h2>
        <button onClick={() => closeDialog("fields")} className="tool-btn" aria-label="Close">
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={scan} disabled={busy} className="btn-ghost h-9 gap-1.5 px-3 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> {fields.length ? "Re-scan" : "Detect fields"}
          </button>
          <button onClick={autoFill} className="btn-ghost h-9 gap-1.5 px-3 text-xs">
            <Wand2 className="h-3.5 w-3.5" /> Smart auto-fill
          </button>
        </div>

        {fields.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-soft">
            No interactive fields detected yet. Tap <b>Detect fields</b> to scan this document for AcroForm inputs.
          </p>
        )}

        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block truncate text-[11px] font-medium text-soft" title={f.name}>
                {f.name} <span className="opacity-60">· {f.type}</span>
              </span>
              {f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={values[f.name] === "true"}
                  onChange={(e) => set(f.name, String(e.target.checked))}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              ) : f.type === "dropdown" || f.type === "list" ? (
                <select
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-[var(--surface-2)] px-2 text-sm"
                >
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-[var(--surface-2)] px-2 text-sm"
                />
              )}
            </label>
          ))}
        </div>

        <details className="mt-4 rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Saved profile (for auto-fill)</summary>
          <div className="grid grid-cols-2 gap-2 p-3">
            {(Object.keys(EMPTY) as (keyof Profile)[]).map((k) => (
              <input
                key={k}
                placeholder={k}
                value={profile[k]}
                onChange={(e) => setProfile((p) => ({ ...p, [k]: e.target.value }))}
                className="h-9 rounded-lg border border-line bg-[var(--surface-2)] px-2 text-xs capitalize"
              />
            ))}
            <button onClick={saveProfile} className="btn-primary col-span-2 h-9 text-xs">
              Save profile locally
            </button>
          </div>
        </details>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <span className="text-[11px] text-soft">{filled} filled</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => exportData("json")} className="btn-ghost h-9 gap-1 px-2.5 text-xs">
            <FileDown className="h-3.5 w-3.5" /> JSON
          </button>
          <button onClick={() => exportData("xfdf")} className="btn-ghost h-9 gap-1 px-2.5 text-xs">
            <FileDown className="h-3.5 w-3.5" /> XFDF
          </button>
          <label className="btn-ghost h-9 cursor-pointer gap-1 px-2.5 text-xs">
            <FileUp className="h-3.5 w-3.5" /> Import
            <input
              type="file"
              accept=".json,.xfdf,.fdf,application/json,application/vnd.adobe.xfdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={apply} disabled={busy || !fields.length} className="btn-primary h-9 px-3 text-xs">
            Apply to PDF
          </button>
        </div>
      </footer>
    </aside>
  );
}