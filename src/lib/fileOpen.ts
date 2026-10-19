"use client";

/**
 * File System Access API helper (R53) with graceful fallback.
 * Returns File objects so the rest of the pipeline is uniform.
 */
export async function openPdfFiles(): Promise<File[] | null> {
  const anyWin = window as any;
  if (typeof anyWin.showOpenFilePicker === "function") {
    try {
      const handles: any[] = await anyWin.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "PDF documents",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const files: File[] = [];
      for (const h of handles) files.push(await h.getFile());
      return files;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
      // fall through to input picker
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.multiple = true;
    input.onchange = () => resolve(input.files ? Array.from(input.files) : null);
    input.click();
  });
}

/** Save bytes via File System Access API if available, else download. */
export async function saveBytes(name: string, bytes: Uint8Array, suggested?: string): Promise<"picker" | "download"> {
  const anyWin = window as any;
  if (typeof anyWin.showSaveFilePicker === "function") {
    try {
      const handle = await anyWin.showSaveFilePicker({
        suggestedName: suggested ?? name,
        types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return "picker";
    } catch (e: any) {
      if (e?.name === "AbortError") return "picker";
    }
  }
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggested ?? name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "download";
}

export function supportsFsAccess(): boolean {
  return typeof window !== "undefined" && typeof (window as any).showSaveFilePicker === "function";
}