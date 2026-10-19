import { describe, it, expect } from "vitest";
import { makeBlankPage, dataUrlToBytes } from "../pdfExport";

describe("makeBlankPage", () => {
  it("defaults to US Letter (612x792)", () => {
    const p = makeBlankPage();
    expect(p.width).toBe(612);
    expect(p.height).toBe(792);
    expect(p.blank).toBe(true);
    expect(p.srcIndex).toBe(-1);
    expect(p.rotation).toBe(0);
  });

  it("honours custom dimensions", () => {
    const p = makeBlankPage(400, 500);
    expect(p.width).toBe(400);
    expect(p.height).toBe(500);
  });

  it("generates unique ids for each blank page", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeBlankPage().id));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.startsWith("blank_")).toBe(true);
  });
});

describe("dataUrlToBytes", () => {
  it("decodes a base64 data URL", () => {
    // "AB" -> bytes [0, 1]
    const bytes = dataUrlToBytes("data:application/octet-stream;base64,AAE=");
    expect(Array.from(bytes)).toEqual([0, 1]);
  });

  it("decodes utf-8 payloads", () => {
    const b64 = Buffer.from("hello", "utf8").toString("base64");
    const bytes = dataUrlToBytes(`data:text/plain;base64,${b64}`);
    expect(Buffer.from(bytes).toString("utf8")).toBe("hello");
  });
});
