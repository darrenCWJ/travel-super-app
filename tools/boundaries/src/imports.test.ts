import { describe, expect, it } from "vitest";
import { collectImports } from "./imports";

const SOURCE = [
  'import { a } from "./a";', //                       1
  'import type { T } from "types-only";', //            2
  'import { type B, c } from "./mixed";', //            3
  'import "./side-effect";', //                         4
  'export { d } from "./d";', //                        5
  'export type { E } from "./e";', //                   6
  'export * from "./star";', //                         7
  'const lazy = await import("./lazy");', //            8
  "const tpl = await import(`./tpl`);", //              9
  "const bad = await import(`./x/${name}`);", //       10
  "const v = await import(someVar);", //               11
  'const r = require("./req");', //                    12
  'import eq = require("./equals");', //               13
  'const ctx = require.context("./dir", true);', //    14
  "const el = <div>{a}</div>;", //                     15
  "export const local = 1;", //                        16
  'type Imp = import("../../polls/core/p").Foo;', //   17
  'type Qry = typeof import("./query");', //           18
  'declare function f(a: Array<import("./nested").N>): void;', // 19
].join("\n");

describe("collectImports", () => {
  const { imports, errors } = collectImports("fixture.tsx", SOURCE);
  const by = (specifier: string | null, kind?: string) =>
    imports.filter((i) => i.specifier === specifier && (kind === undefined || i.kind === kind));

  it("parses the fixture without errors", () => {
    expect(errors).toEqual([]);
  });

  it("reports static imports with their line and type-only flag", () => {
    expect(by("./a")).toEqual([{ specifier: "./a", kind: "import", typeOnly: false, line: 1 }]);
    expect(by("types-only")).toEqual([{ specifier: "types-only", kind: "import", typeOnly: true, line: 2 }]);
  });

  it("treats an import with any value binding as a value import", () => {
    expect(by("./mixed")[0].typeOnly).toBe(false);
  });

  it("reports side-effect imports as value imports", () => {
    expect(by("./side-effect")).toEqual([{ specifier: "./side-effect", kind: "import", typeOnly: false, line: 4 }]);
  });

  it("reports re-exports, including export * and export type", () => {
    expect(by("./d", "export")[0].line).toBe(5);
    expect(by("./e", "export")[0].typeOnly).toBe(true);
    expect(by("./star", "export")[0].line).toBe(7);
  });

  it("does not report local exports", () => {
    expect(imports.filter((i) => i.line === 16)).toEqual([]);
  });

  it("reads literal dynamic imports, including substitution-free templates", () => {
    expect(by("./lazy", "dynamic")[0].line).toBe(8);
    expect(by("./tpl", "dynamic")[0].line).toBe(9);
  });

  it("marks dynamic imports it cannot read as unknown", () => {
    const unknown = imports.filter((i) => i.kind === "dynamic-unknown").map((i) => i.line);
    expect(unknown).toEqual([10, 11]);
  });

  it("finds require, import-equals and require.context by walking the AST", () => {
    expect(by("./req", "require")[0].line).toBe(12);
    expect(by("./equals", "import-equals")[0].line).toBe(13);
    expect(by("./dir", "require-context")[0].line).toBe(14);
  });

  it("reads a type-position import(\"x\").T as a type-only import, wherever the type appears", () => {
    expect(by("../../polls/core/p")).toEqual([{ specifier: "../../polls/core/p", kind: "import", typeOnly: true, line: 17 }]);
    expect(by("./query")).toEqual([{ specifier: "./query", kind: "import", typeOnly: true, line: 18 }]);
    expect(by("./nested")).toEqual([{ specifier: "./nested", kind: "import", typeOnly: true, line: 19 }]);
  });

  it("counts every reference exactly once", () => {
    expect(imports).toHaveLength(17);
  });

  it("returns parse errors instead of throwing", () => {
    const broken = collectImports("broken.ts", 'import { from "x"');
    expect(broken.errors.length).toBeGreaterThan(0);
  });
});

describe("collectImports: import.meta.glob", () => {
  const source = [
    'const a = import.meta.glob("./a/*.ts");', //                               1
    'const b = import.meta.globEager("./b/*.ts");', //                          2
    'const c = import.meta.glob(["./c/*.ts", "./d/*.ts"], { eager: true });', // 3
    "const d = import.meta.url;", //                                            4
    'const e = meta.glob("./an-object-called-meta");', //                       5
    'function F() { return new.target.glob("./not-import-meta"); }', //         6
  ].join("\n");

  it("reports a glob or globEager call on import.meta and nothing else, with the pattern when it is one string", () => {
    const { imports, errors } = collectImports("fixture.ts", source);
    expect(errors).toEqual([]);
    expect(imports).toEqual([
      { specifier: "./a/*.ts", kind: "import-meta-glob", typeOnly: false, line: 1 },
      { specifier: "./b/*.ts", kind: "import-meta-glob", typeOnly: false, line: 2 },
      { specifier: null, kind: "import-meta-glob", typeOnly: false, line: 3 },
    ]);
  });
});
