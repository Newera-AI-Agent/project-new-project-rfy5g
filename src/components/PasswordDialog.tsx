"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Unlock } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useDialog, closeDialog } from "@/lib/dialogs";
import { encryptDoc, removeEncryption } from "@/lib/password";

/**
 * Add / change / remove a password and the permission bits, entirely on this
 * device (req 47, 46).
 */
export default function PasswordDialog() {
  const { open } = useDialog("password");
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => (s.activeId ? s.docs[s.activeId] : undefined));
  const patchDoc = useStore((s) => s.patchDoc);
  const toast = useStore((s) => s.toast);
  const setBusy = useStore((s) => s.setBusy);

  const [user, setUser] = useState("");
  const [owner, setOwner] = useState("");
  const [show, setShow] = useState(false);
  const [perms, setPerms] = useState({
    allowPrinting: true,
    allowCopying: true,
    allowModifying: true,
    allowAnnotating: true,
  });
  const [busy, setLocalBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setUser("");
      setOwner("");
      setShow(false);
      setLocalBusy(false);
    }
  }, [open]);

  if (!open || !doc) return null;

  async function protect() {
    if (!activeId || !doc) return;
    if (!user) {
      toast("Enter a password to protect this document", "error");
      return;
    }
    setLocalBusy(true);
    setBusy("password");
    try {
      const bytes = await encryptDoc(doc, user, owner || null, perms);
      patchDoc(activeId, { bytes, size: bytes.byteLength, encrypted: true, dirty: true });
      toast("Document encrypted — reopen needs the password", "success");
      closeDialog("password");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(
        /ALREADY_ENCRYPTED|Encrypt/i.test(msg)
          ? "This document is already encrypted — decrypt it first"
          : `Could not encrypt: ${msg}`,
        "error",
      );
    } finally {
      setLocalBusy(false);
      setBusy(null);
    }
  }

  async function unprotect() {
    if (!activeId) return;
    setLocalBusy(true);
    setBusy("password");
    try {
      const bytes = await removeEncryption(doc);
      patchDoc(activeId, { bytes, size: bytes.byteLength, encrypted: false, dirty: true });
      toast("Password protection removed", "success");
      closeDialog("password");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(`Could not decrypt: ${msg}`, "error");
    } finally {
      setLocalBusy(false);
      setBusy(null);
    }
  }

  const PERMS: { key: keyof typeof perms; label: string }[] = [
    { key: "allowPrinting", label: "Allow printing" },
    { key: "allowCopying", label: "Allow copying text" },
    { key: "allowModifying", label: "Allow editing pages" },
    { key: "allowAnnotating", label: "Allow comments & forms" },
  ];

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center"
      onClick={(e) => e.target === e.currentTarget && closeDialog("password")}
      role="dialog"
      aria-modal="true"
      aria-label="Password protection"
    >
      <div
        data-dialog-panel
        className="surface max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line p-4 shadow-2xl animate-slide-up md:max-w-md md:rounded-2xl md:animate-fade-in"
      >
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <KeyRound className="h-4 w-4 text-[var(--accent)]" /> Password &amp; permissions
        </h2>
        <p className="mb-3 text-xs text-soft">{doc.name}</p>

        <label className="mb-2 block">
          <span className="mb-1 block text-xs font-medium text-soft">Open password</span>
          <div className="flex items-center gap-2">
            <input
              type={show ? "text" : "password"}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="new-password"
              placeholder="Required to open the PDF"
              className="h-11 w-full rounded-lg border border-line bg-[var(--surface-2)] px-3 text-sm"
            />
            <button onClick={() => setShow((v) => !v)} className="tool-btn h-11 w-11 shrink-0" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-soft">Owner password (optional)</span>
          <input
            type={show ? "text" : "password"}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            autoComplete="new-password"
            placeholder="Controls permissions"
            className="h-11 w-full rounded-lg border border-line bg-[var(--surface-2)] px-3 text-sm"
          />
        </label>

        <fieldset className="mb-4 rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-soft">Permissions</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERMS.map((p) => (
              <label key={p.key} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={perms[p.key]}
                  onChange={(e) => setPerms((s) => ({ ...s, [p.key]: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        {doc.encrypted && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] p-2 text-xs text-soft">
            <Lock className="h-3.5 w-3.5" /> This document is currently encrypted.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={protect} disabled={busy} className="btn-primary h-11 flex-1 gap-1.5 text-sm">
            <Lock className="h-4 w-4" /> {busy ? "Working…" : "Protect"}
          </button>
          <button onClick={unprotect} disabled={busy} className="btn-ghost h-11 flex-1 gap-1.5 text-sm">
            <Unlock className="h-4 w-4" /> Remove password
          </button>
        </div>
        <p className="mt-3 text-[11px] text-soft">
          Encryption (RC4 128-bit) and decryption happen here in the browser. Your password never leaves the device.
        </p>
      </div>
    </div>
  );
}