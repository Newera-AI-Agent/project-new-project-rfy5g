import { describe, it, expect } from "vitest";
import {
  uid,
  clamp,
  cn,
  formatBytes,
  hexToRgb,
  normRect,
  intersectRect,
  pageDims,
  isEditableTarget,
  STAMP_TEMPLATES,
} from "@/lib/utils";

describe("uid", () => {
  it("produces prefixed, unique ids", () => {
    const a = uid("page");
    const b = uid("page");
    expect(a.startsWith("page_")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("defaults to the `id` prefix", () => {
    expect(uid().startsWith("id_")).toBe(true);
  });
});

describe("clamp", () => {
  it("keeps values inside range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(11, 1, 10)).toBe(10);
  });
});

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("formatBytes", () => {
  it("formats zero and unit boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("hexToRgb", () => {
  it("parses long and short hex into 0..1 channels", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    const short = hexToRgb("#f00");
    expect(short.r).toBeCloseTo(1, 5);
    expect(short.g).toBe(0);
    expect(short.b).toBe(0);
  });
});

describe("normRect", () => {
  it("normalizes a rectangle drawn in any direction", () => {
    expect(normRect(10, 20, 30, 50)).toEqual({ x: 10, y: 20, w: 20, h: 30 });
    expect(normRect(30, 50, 10, 20)).toEqual({ x: 10, y: 20, w: 20, h: 30 });
  });
});

describe("intersectRect", () => {
  it("returns the overlap area", () => {
    const r = intersectRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 });
    expect(r).toEqual({ x: 5, y: 5, w: 5, h: 5 });
  });

  it("clamps disjoint rects to zero size instead of negative", () => {
    const r = intersectRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 10, y: 10, w: 2, h: 2 });
    expect(r.w).toBe(0);
    expect(r.h).toBe(0);
  });
});

describe("pageDims", () => {
  it("uses page size when present, else Letter fallback", () => {
    expect(pageDims({ width: 300, height: 400, rotation: 0 })).toEqual({ w: 300, h: 400 });
    expect(pageDims({ rotation: 0 })).toEqual({ w: 612, h: 792 });
  });

  it("swaps width/height for 90° rotations", () => {
    expect(pageDims({ width: 300, height: 400, rotation: 90 })).toEqual({ w: 400, h: 300 });
  });
});

describe("isEditableTarget", () => {
  it("recognizes inputs and contenteditable hosts", () => {
    const input = document.createElement("input");
    expect(isEditableTarget(input)).toBe(true);
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.appendChild(div);
    expect(isEditableTarget(div)).toBe(true);
    expect(isEditableTarget(document.createElement("span"))).toBe(false);
  });
});

describe("STAMP_TEMPLATES", () => {
  it("ships the expected quick stamps", () => {
    expect(STAMP_TEMPLATES).toEqual(
      expect.arrayContaining(["Approved", "Draft", "Confidential", "Reviewed"]),
    );
  });
});
