import { parseSync } from "oxc-parser";

/** How a file refers to another module. */
export type ImportKind =
  | "import" // import … from "x" / import "x" / a type-position import("x").T (always typeOnly)
  | "export" // export … from "x" / export * from "x"
  | "dynamic" // import("x")
  | "require" // require("x")
  | "import-equals" // import x = require("x")  (TypeScript; oxc's module record leaves it out)
  | "require-context" // require.context("./dir")  (Metro; bypasses the registry)
  | "import-meta-glob" // import.meta.glob("./dir/*.ts"), import.meta.globEager(…)  (Vite; bypasses the registry)
  | "dynamic-unknown"; // import(someVariable) — cannot be checked

export interface ImportRef {
  // null for "dynamic-unknown", and for a require.context or import.meta.glob call whose first argument is not one string
  specifier: string | null;
  kind: ImportKind;
  typeOnly: boolean;
  line: number;
}

export interface ParsedImports {
  imports: ImportRef[];
  errors: string[];
}

/**
 * The module references in one file that this function can see. oxc's module record supplies static
 * imports, re-exports and import("x") calls; require("x"), `import x = require("x")`,
 * require.context("./dir"), import.meta.glob("…") / import.meta.globEager("…") and the type-position
 * `import("x").T` are not in it, so they are found by walking the AST.
 *
 * Not seen, so nothing here can refuse them:
 * - triple-slash directives (`/// <reference path="…" />`, `/// <reference types="…" />`);
 * - JSDoc types (`@type {import("x")}`): comments are not walked;
 * - `require.resolve("x")`;
 * - a `require` reached through another name (`const r = require; r("x")`), and `createRequire`:
 *   only a call spelled `require(…)` or `require.context(…)` is recognised. The same holds for
 *   `import.meta` kept in a variable, and for a member reached by a computed key
 *   (`require["context"]`, `import.meta["glob"]`).
 */
export function collectImports(filename: string, source: string): ParsedImports {
  const result = parseSync(filename, source);
  const lineOf = lineIndex(source);
  const imports: ImportRef[] = [];

  for (const stmt of result.module.staticImports) {
    const typeOnly = stmt.entries.length > 0 && stmt.entries.every((e) => e.isType);
    imports.push({ specifier: stmt.moduleRequest.value, kind: "import", typeOnly, line: lineOf(stmt.moduleRequest.start) });
  }
  for (const stmt of result.module.staticExports) {
    const fromEntries = stmt.entries.filter((e) => e.moduleRequest);
    if (fromEntries.length === 0) continue;
    const request = fromEntries[0].moduleRequest!;
    const typeOnly = fromEntries.every((e) => e.isType);
    imports.push({ specifier: request.value, kind: "export", typeOnly, line: lineOf(request.start) });
  }
  for (const dyn of result.module.dynamicImports) {
    const text = source.slice(dyn.moduleRequest.start, dyn.moduleRequest.end);
    const literal = stringLiteral(text);
    imports.push(
      literal === null
        ? { specifier: null, kind: "dynamic-unknown", typeOnly: false, line: lineOf(dyn.start) }
        : { specifier: literal, kind: "dynamic", typeOnly: false, line: lineOf(dyn.start) },
    );
  }
  walk(result.program, (node) => {
    if (node.type === "TSImportEqualsDeclaration" && node.moduleReference?.type === "TSExternalModuleReference") {
      imports.push({
        specifier: node.moduleReference.expression.value,
        kind: "import-equals",
        typeOnly: node.importKind === "type",
        line: lineOf(node.start),
      });
    }
    // `type T = import("x").Y` and `typeof import("x")`: a TS import type, not a call, so the module record misses it.
    if (node.type === "TSImportType" && node.source?.type === "Literal" && typeof node.source.value === "string") {
      imports.push({ specifier: node.source.value, kind: "import", typeOnly: true, line: lineOf(node.start) });
    }
    if (node.type !== "CallExpression") return;
    const callee = node.callee;
    const first = node.arguments?.[0];
    const literal = first?.type === "Literal" && typeof first.value === "string" ? first.value : null;
    if (callee?.type === "Identifier" && callee.name === "require") {
      imports.push({ specifier: literal, kind: literal === null ? "dynamic-unknown" : "require", typeOnly: false, line: lineOf(node.start) });
    }
    if (
      callee?.type === "MemberExpression" &&
      callee.object?.type === "Identifier" &&
      callee.object.name === "require" &&
      callee.property?.name === "context"
    ) {
      imports.push({ specifier: literal, kind: "require-context", typeOnly: false, line: lineOf(node.start) });
    }
    // import.meta is the MetaProperty whose first word is `import` (the other one is new.target).
    if (
      callee?.type === "MemberExpression" &&
      callee.object?.meta?.name === "import" &&
      (callee.property?.name === "glob" || callee.property?.name === "globEager")
    ) {
      imports.push({ specifier: literal, kind: "import-meta-glob", typeOnly: false, line: lineOf(node.start) });
    }
  });

  return { imports, errors: result.errors.map((e) => e.message) };
}

/** "x" / 'x' / `x` (no substitutions) → x; anything else → null. */
function stringLiteral(text: string): string | null {
  const t = text.trim();
  const quote = t[0];
  if ((quote === '"' || quote === "'" || quote === "`") && t.at(-1) === quote && t.length >= 2) {
    const body = t.slice(1, -1);
    if (quote === "`" && body.includes("${")) return null;
    return body;
  }
  return null;
}

function lineIndex(source: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// oxc's program is a plain ESTree-shaped object; walk every nested node.
// biome-ignore lint/suspicious/noExplicitAny: the AST is untyped JSON here.
function walk(node: any, visit: (n: any) => void): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key in node) {
    if (key !== "parent") walk(node[key], visit);
  }
}
