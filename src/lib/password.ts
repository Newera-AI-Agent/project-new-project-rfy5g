"use client";

import { buildPdf } from "./pdfExport";
import type { PdfDoc } from "./types";

/** Permission flags exposed in the password dialog (req 47). */
export interface PermissionOptions {
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
  allowAnnotating: boolean;
}

function bytesOf(u: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u.byteLength);
  new Uint8Array(ab).set(u);
  return ab;
}

/**
 * Encrypt a document with a user (open) password and an optional owner
 * (permissions) password. Everything runs in the browser (req 46, 47).
 */
export async function encryptDoc(
  doc: PdfDoc,
  userPassword: string,
  ownerPassword: string | null,
  perms: PermissionOptions,
): Promise<ArrayBuffer> {
  const { encryptPDF } = await import("@pdfsmaller/pdf-encrypt-lite");
  const flat = await buildPdf(doc, { flatten: true, applyRedactions: true });
  const encrypted = await encryptPDF(flat, userPassword, {
    ownerPassword: ownerPassword ?? undefined,
    ...perms,
    allowFillingForms: perms.allowAnnotating || perms.allowModifying,
    allowExtraction: perms.allowCopying,
    allowAssembly: perms.allowModifying,
    allowHighQualityPrint: perms.allowPrinting,
  });
  return bytesOf(encrypted);
}

/**
 * Try to strip encryption by re-saving through pdf-lib. Only works for
 * documents the user can already open (no password) — pdf-lib reads the
 * content and writes a fresh, unencrypted file (req 47).
 */
export async function removeEncryption(doc: PdfDoc): Promise<ArrayBuffer> {
  const flat = await buildPdf(doc, { flatten: false, applyRedactions: true });
  return bytesOf(flat);
}
