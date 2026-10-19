"use client";

import type { PdfDoc, FormFieldInfo } from "@/lib/types";

/**
 * Detect AcroForm fields in a PDF using pdf-lib's form API.
 * Entirely client-side; falls back to an empty list for PDFs without forms.
 */
export async function detectFields(doc: PdfDoc): Promise<FormFieldInfo[]> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(doc.bytes.slice(0), { ignoreEncryption: true });
    const form = pdf.getForm();
    const fields = form.getFields();
    const out: FormFieldInfo[] = [];
    for (const f of fields) {
      const name = f.getName();
      const ctor = f.constructor.name;
      let type = "text";
      if (ctor.includes("CheckBox")) type = "checkbox";
      else if (ctor.includes("Radio")) type = "radio";
      else if (ctor.includes("Dropdown")) type = "dropdown";
      else if (ctor.includes("Option")) type = "list";
      else if (ctor.includes("Button")) type = "button";
      let value = "";
      try {
        if (type === "checkbox") value = (f as any).isChecked?.() ? "true" : "false";
        else if (type === "dropdown" || type === "list") value = String((f as any).getSelected?.() ?? "");
        else value = String((f as any).getText?.() ?? "");
      } catch {
        value = "";
      }
      const options: string[] = [];
      try {
        const opts = (f as any).getOptions?.();
        if (Array.isArray(opts)) options.push(...opts.map(String));
      } catch {
        /* ignore */
      }
      let rects: { page: number; rect: { x: number; y: number; w: number; h: number } }[] = [];
      try {
        const widgets = (f as any).acroField?.getWidgets?.() ?? [];
        rects = widgets.map((w: any) => {
          const r = w.getRectangle?.() ?? null;
          const pg = pdf.getPages().findIndex((p) => {
            try {
              return (p as any).ref?.toString() === (w.P?.() as any)?.toString();
            } catch {
              return false;
            }
          });
          const page = pg >= 0 ? pg : 0;
          const pgSize = pdf.getPages()[page]?.getSize?.() ?? { width: 612, height: 792 };
          if (!r) return { page, rect: { x: 0, y: 0, w: 0, h: 0 } };
          return {
            page,
            rect: {
              x: r.x / pgSize.width,
              y: 1 - (r.y + r.height) / pgSize.height,
              w: r.width / pgSize.width,
              h: r.height / pgSize.height,
            },
          };
        });
      } catch {
        /* ignore */
      }
      out.push({ name, type, value, options: options.length ? options : undefined, rects });
    }
    return out;
  } catch {
    return [];
  }
}

/** Apply filled field values back into the PDF and return new bytes. */
export async function applyFields(doc: PdfDoc, values: Record<string, string>): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.load(doc.bytes.slice(0), { ignoreEncryption: true });
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(helv);
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values)) continue;
    const val = values[name];
    const ctor = field.constructor.name;
    try {
      if (ctor.includes("CheckBox")) {
        val === "true" ? (field as any).check() : (field as any).uncheck();
      } else if (ctor.includes("Dropdown") || ctor.includes("Radio") || ctor.includes("Option")) {
        (field as any).select(val);
      } else if (ctor.includes("Text")) {
        (field as any).setText(val);
      }
    } catch {
      /* skip incompatible field */
    }
  }
  return pdf.save();
}

/** Serialize field values to a JSON string. */
export function toJson(values: Record<string, string>): string {
  return JSON.stringify({ version: 1, fields: values }, null, 2);
}

/** Parse a JSON field-data string back into a values map. */
export function fromJson(text: string): Record<string, string> {
  const data = JSON.parse(text) as { fields?: Record<string, string> };
  return data.fields ?? (data as Record<string, string>);
}

/** Minimal XFDF writer (widely accepted by Acrobat / reader apps). */
export function toXfdf(values: Record<string, string>): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rows = Object.entries(values)
    .map(([k, v]) => `    <field name="${esc(k)}"><value>${esc(v)}</value></field>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n  <fields>\n${rows}\n  </fields>\n</xfdf>\n`;
}

/** Parse an XFDF or FDF-ish text payload into a values map. */
export function fromXfdf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<field\s+name="([^"]+)"\s*>\s*<value>([^<]*)<\/value>\s*<\/field>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out[m[1]] = m[2].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  }
  return out;
}
