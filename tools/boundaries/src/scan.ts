import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative } from "node:path";
import { ResolverFactory } from "oxc-resolver";
import { collectImports, type ImportRef } from "./imports";
import { checkEdge, type Target } from "./rules";
import { classify, TEST_FILE, type Zone } from "./zones";

export interface Violation {
  file: string; // repo-relative, POSIX
  line: number;
  specifier: string | null;
  reason: string;
}

export interface ScanResult {
  violations: Violation[];
  /** Every file the rules were applied to, repo-relative and sorted: proof the scan looked at something. */
  scannedFiles: string[];
}

export interface ScanOptions {
  /** Absolute path of the repo root. */
  root: string;
  /** Repo-relative directories to scan. */
  scanRoots?: string[];
  /** Repo-relative directory → its tsconfig.json, for path aliases such as "@/". Longest prefix wins. */
  tsconfigs?: Record<string, string>;
}

export const SCAN_ROOTS = ["apps/web", "apps/mobile/src", "features", "platform", "reference"];
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".expo", ".turbo", ".git", ".claude", ".vercel", ".superpowers", "dist", "build", "coverage",
  "android", "ios", "playwright-report", "test-results",
]);
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const LAYER_ROOTS = ["features", "platform", "reference"];

/** Every boundary violation under the scan roots, sorted by file then line. */
export function scanRepo(options: ScanOptions): ScanResult {
  // The resolver answers with real paths, so the root must be real too, or a root reached
  // through a junction or an 8.3 short name would read every import as outside the repo.
  const root = realpathSync.native(options.root);
  const workspace = workspacePackageNames(root);
  const resolvers = new Map<string, ResolverFactory>();
  const resolverFor = (rel: string) => {
    const match = Object.keys(options.tsconfigs ?? {})
      .filter((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
      .sort((a, b) => b.length - a.length)[0];
    const key = match ?? "";
    let resolver = resolvers.get(key);
    if (resolver === undefined) {
      resolver = new ResolverFactory({
        conditionNames: ["import", "require", "node", "default", "types"],
        extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
        extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] },
        ...(match ? { tsconfig: { configFile: join(root, options.tsconfigs![match]), references: "auto" as const } } : {}),
      });
      resolvers.set(key, resolver);
    }
    return resolver;
  };

  const violations: Violation[] = [];
  const scannedFiles: string[] = [];
  for (const scanRoot of options.scanRoots ?? SCAN_ROOTS) {
    const dir = join(root, scanRoot);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const rel = toPosix(relative(root, file));
      const zone = classify(rel);
      if (zone === null) continue;
      scannedFiles.push(rel);
      if (zone.layer !== "app" && zone.part === null) {
        violations.push({ file: rel, line: 1, specifier: null, reason: "file is in no part folder (core, client, server, db, web, mobile, tests)" });
        continue;
      }
      const { imports, errors } = collectImports(file, readFileSync(file, "utf8"));
      for (const message of errors) violations.push({ file: rel, line: 1, specifier: null, reason: `cannot parse: ${message}` });
      for (const ref of imports) {
        const reason = judge(ref, zone, file);
        if (reason !== null) violations.push({ file: rel, line: ref.line, specifier: ref.specifier, reason });
      }
    }
  }
  // Code-unit order, like scannedFiles: localeCompare would sort differently on another machine's locale.
  violations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { violations, scannedFiles: scannedFiles.sort() };

  function judge(ref: ImportRef, zone: Zone, file: string): string | null {
    if (ref.kind === "dynamic-unknown") {
      // Test files and the tests/ and e2e/ folders (zone "test") may compute a specifier.
      return TEST_FILE.test(file) || zone.part === "test" ? null : "an import or require with a computed specifier cannot be checked";
    }
    if (ref.kind === "require-context") return "require.context bypasses the generated registry";
    const specifier = ref.specifier!;
    const target = resolveTarget(specifier, file);
    return typeof target === "string" ? target : checkEdge(zone, target);
  }

  function resolveTarget(specifier: string, file: string): Target | string {
    if (isBuiltin(specifier)) return { kind: "builtin", name: specifier };
    const name = packageName(specifier);
    if (name !== null && !workspace.has(name)) return { kind: "package", name };
    const result = resolverFor(toPosix(relative(root, file))).sync(dirname(file), specifier);
    if (!result.path) return `cannot resolve ${specifier}: ${result.error ?? "unknown error"}`;
    const rel = toPosix(relative(root, result.path));
    if (rel.startsWith("..") || rel.split("/").includes("node_modules")) {
      return name !== null ? { kind: "package", name } : `${specifier} resolves outside the repo`;
    }
    const zone = classify(rel);
    return zone === null ? { kind: "unzoned", rel } : { kind: "zone", zone };
  }
}

/** Names of the workspace's own packages: their imports resolve to files and are judged by zone. */
function workspacePackageNames(root: string): Set<string> {
  const names = new Set<string>();
  const manifests = [...LAYER_ROOTS.map((d) => join(root, d, "package.json"))];
  for (const group of ["apps", "tools"]) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(dir, entry.name, "package.json"));
    }
  }
  for (const manifest of manifests) {
    // A package.json saved with a byte-order mark would otherwise crash JSON.parse before any file is scanned.
    if (existsSync(manifest)) names.add(JSON.parse(readFileSync(manifest, "utf8").replace(/^\uFEFF/, "")).name);
  }
  return names;
}

/** "@scope/pkg/sub" → "@scope/pkg"; "pkg/sub" → "pkg"; relative, absolute and aliased specifiers → null. */
export function packageName(specifier: string): string | null {
  if (isRelative(specifier) || specifier.startsWith("@/") || specifier.startsWith("#") || specifier.startsWith("~")) return null;
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (CODE_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield join(dir, entry.name);
    }
  }
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}
