import { describe, it, expect } from "vitest";
import { toJson, fromJson, toXfdf, fromXfdf } from "@/lib/formio";

describe("form data round-trips", () => {
  const values = { fullName: "Ada Lovelace", email: "ada@example.com", agree: "true" };

  it("JSON: serializes under a versioned envelope and parses back", () => {
    const json = toJson(values);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.fields).toEqual(values);
    expect(fromJson(json)).toEqual(values);
  });

  it("JSON: tolerates a bare field map", () => {
    expect(fromJson(JSON.stringify(values))).toEqual(values);
  });

  it("XFDF: writes a valid document and parses it back", () => {
    const xfdf = toXfdf(values);
    expect(xfdf).toContain("<?xml version=\"1.0\"");
    expect(xfdf).toContain("<field name=\"fullName\"><value>Ada Lovelace</value></field>");
    expect(fromXfdf(xfdf)).toEqual(values);
  });

  it("XFDF: escapes & < > \" in names and values", () => {
    const tricky = { "a&b": "x < y > z \"q\"" };
    const xfdf = toXfdf(tricky);
    expect(xfdf).toContain("a&amp;b");
    expect(xfdf).not.toContain("x < y");
    expect(fromXfdf(xfdf)).toEqual(tricky);
  });

  it("XFDF: returns an empty map when there are no fields", () => {
    expect(fromXfdf("<xfdf></xfdf>")).toEqual({});
  });
});
