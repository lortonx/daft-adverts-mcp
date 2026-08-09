import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";

const PKG = path.resolve(import.meta.dir, "..");
const inventory = JSON.parse(
  fs.readFileSync(path.join(PKG, "research/inventory.json"), "utf8")
);
const adverts = fs.readFileSync(path.join(PKG, "src/adverts.ts"), "utf8");

const begin = "  // --- BEGIN GENERATED METHODS ---";
const end = "  // --- END GENERATED METHODS ---";
const region = adverts.slice(adverts.indexOf(begin), adverts.indexOf(end));

describe("AdvertsApi inventory parity", () => {
  it("covers all 120 Retrofit methods as 119 public TS methods", () => {
    expect(inventory.rawRetrofitMethods).toBe(120);
    expect(inventory.publicMethods).toBe(119);
    expect(inventory.methods).toHaveLength(119);
  });

  it("exposes every inventory tsName on AdvertsApi", () => {
    const found = new Set(
      [...region.matchAll(/async (\w+)\(/g)].map((m) => m[1])
    );
    const missing = inventory.methods
      .map((m: { tsName: string }) => m.tsName)
      .filter((n: string) => !found.has(n));
    expect(missing).toEqual([]);
  });

  it("has no extra generated methods beyond inventory", () => {
    const found = [...region.matchAll(/async (\w+)\(/g)].map((m) => m[1]);
    const allowed = new Set(
      inventory.methods.map((m: { tsName: string }) => m.tsName)
    );
    const extra = found.filter((n) => !allowed.has(n));
    expect(extra).toEqual([]);
  });

  it("uses template-literal paths (no .replace or {placeholder} in code)", () => {
    expect(region.includes('.replace("{')).toBe(false);
    expect(region.includes(".replace('{")).toBe(false);
    const code = region.replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/.test(code)).toBe(false);
  });

  it("has no unknown in public method signatures", () => {
    const badRet = [
      ...region.matchAll(/async \w+\([^)]*\): Promise<(unknown(?:\[\])?)>/g),
    ].map((m) => m[0]);
    const badParam = [
      ...region.matchAll(/async \w+\([^)]*\bunknown\b[^)]*\):/g),
    ].map((m) => m[0]);
    expect(badRet).toEqual([]);
    expect(badParam).toEqual([]);
  });

  it("encodes path segments with enc()", () => {
    expect(adverts).toContain("function enc(");
    expect(region).toContain("${enc(");
  });

  it("uses object-literal form/query (no fields/query mutation or as-casts)", () => {
    const code = region.replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(/as string \| number \| boolean/.test(region)).toBe(false);
    expect(/\bfields\s*\[/.test(code)).toBe(false);
    expect(/\bquery\s*\[/.test(code)).toBe(false);
    expect(/const fields:\s*Record/.test(region)).toBe(false);
    expect(/Object\.assign\(\s*query\s*,/.test(region)).toBe(false);
    expect(/\bLooseFormParams\b/.test(region)).toBe(false);
    expect(/\bFormScalar\b/.test(region)).toBe(false);
  });

  it("inventory has no never/unknown param kinds", () => {
    const bad = inventory.methods.flatMap(
      (m: {
        tsName: string;
        returnTs: string;
        params: Array<{ name: string; kind: string; tsType: string }>;
      }) => {
        const out: string[] = [];
        if (m.returnTs === "never") out.push(`${m.tsName}:return`);
        for (const p of m.params) {
          if (p.tsType === "never" || p.kind === "unknown") {
            out.push(`${m.tsName}:${p.name}`);
          }
        }
        return out;
      }
    );
    expect(bad).toEqual([]);
  });
});
