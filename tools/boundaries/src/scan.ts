import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { basename, dirname, join, relative } from "node:path";
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
  /**
   * Repo-relative directory → its tsconfig.json, for path aliases such as "@/". Longest prefix wins.
   * The scan throws when the resolver cannot load one of them.
   */
  tsconfigs?: Record<string, string>;
  /**
   * Refuse a bare specifier that does not resolve, unless the import is type-only: for a tree whose
   * packages are all installed. Off by default, and such a specifier is then taken for a package
   * that is not installed and judged by its name.
   */
  refuseUnresolved?: boolean;
}

/** The mobile app's root-level config files (app.config.js …) are left out on purpose: they run in Node, not in the app. */
export const SCAN_ROOTS = ["apps/web", "apps/mobile/src", "apps/mobile/tests", "features", "platform", "reference"];
/** Build output. Skipped only directly under a scan root: deeper down these are ordinary folder names. */
const BUILD_OUTPUT_DIRS = new Set(["dist", "build", "coverage", "android", "ios", "playwright-report", "test-results"]);
const CODE_FILE = /\.[cm]?[jt]sx?$/;
// Where the scan looks for the workspace's own packages: each layer is one package, each folder under a group is one.
const LAYER_ROOTS = ["features", "platform", "reference"];
const PACKAGE_GROUPS = ["apps", "tools"];
/** The same places as pnpm-workspace.yaml writes them. repo.test.ts fails when that file lists one this does not. */
export const WORKSPACE_LOCATIONS = [...LAYER_ROOTS, ...PACKAGE_GROUPS.map((group) => `${group}/*`)];

/** Every boundary violation under the scan roots, sorted by file then line. */
export function scanRepo(options: ScanOptions): ScanResult {
  // The resolver answers with real paths, so the root must be real too, or a root reached
  // through a junction or an 8.3 short name would read every import as outside the repo.
  const root = realpathSync.native(options.root);
  const workspace = workspacePackages(root);
  const workspaceFolders = [...workspace];
  /** The name of the workspace package a repo-relative file belongs to, if it belongs to one. */
  const packageOf = (rel: string) => workspaceFolders.find(([, folder]) => rel.startsWith(`${folder}/`))?.[0];
  const manifestIn = cached(readManifest);
  const tsconfigs = options.tsconfigs ?? {};
  const resolvers = new Map<string | undefined, ResolverFactory>();
  /** The resolver that reads the tsconfig registered for `dir`; with no `dir`, the plain one that reads none. */
  const resolverWith = (dir?: string) => {
    let resolver = resolvers.get(dir);
    if (resolver === undefined) {
      resolver = new ResolverFactory({
        conditionNames: ["import", "require", "node", "default", "types"],
        extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
        extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] },
        ...(dir === undefined ? {} : { tsconfig: { configFile: join(root, tsconfigs[dir]), references: "auto" as const } }),
      });
      if (dir !== undefined) assertLoads(resolver, tsconfigs[dir]);
      resolvers.set(dir, resolver);
    }
    return resolver;
  };
  /** The resolver for a repo-relative file: the one of the longest registered directory it sits under. */
  const resolverFor = (rel: string) =>
    resolverWith(
      Object.keys(tsconfigs)
        .filter((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
        .sort((a, b) => b.length - a.length)[0],
    );
  // A resolver whose tsconfig does not load fails every lookup, and a bare specifier that does not
  // resolve is judged by its name (resolveTarget): the aliases would be switched off without a word.
  // The tsconfig file itself is the one path that must resolve whenever the file loads.
  function assertLoads(resolver: ResolverFactory, tsconfig: string): void {
    const configFile = join(root, tsconfig);
    const probe = resolver.sync(dirname(configFile), `./${basename(configFile)}`);
    if (!probe.path) throw new Error(`cannot load ${tsconfig}: ${probe.error ?? "unknown error"}`);
  }
  // Every registered tsconfig is loaded before the first file is read, whether or not an import needs it.
  for (const dir of Object.keys(tsconfigs)) resolverWith(dir);

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
        const reason = judge(ref, zone, rel);
        if (reason !== null) violations.push({ file: rel, line: ref.line, specifier: ref.specifier, reason });
      }
    }
  }
  // Code-unit order, like scannedFiles: localeCompare would sort differently on another machine's locale.
  violations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { violations, scannedFiles: scannedFiles.sort() };

  /** Why the file `from` (repo-relative, in `zone`) may not make this reference, or null when it may. */
  function judge(ref: ImportRef, zone: Zone, from: string): string | null {
    if (ref.kind === "dynamic-unknown") {
      // Test files and the tests/ and e2e/ folders (zone "test") may compute a specifier.
      return TEST_FILE.test(from) || zone.part === "test" ? null : "an import or require with a computed specifier cannot be checked";
    }
    if (ref.kind === "require-context") return "require.context bypasses the generated registry";
    if (ref.kind === "import-meta-glob") return "import.meta.glob bypasses the generated registry";
    const specifier = ref.specifier!;
    const resolved = resolveTarget(specifier, from, ref.typeOnly);
    if (typeof resolved === "string") return resolved;
    // The zone rules speak first; what they allow must still arrive through the other package's name.
    return checkEdge(zone, resolved.target) ?? checkPackageBoundary(specifier, from, resolved.rel);
  }

  /**
   * A relative path or an alias reaches any file of another workspace package, which would leave
   * that package's `exports` map deciding nothing. So a file in another workspace package has to be
   * imported through that package's own name. `to` is the repo-relative file the import landed on.
   */
  function checkPackageBoundary(specifier: string, from: string, to: string | null): string | null {
    const owner = to === null ? undefined : packageOf(to);
    if (owner === undefined || owner === packageOf(from)) return null;
    if (owner !== packageName(specifier)) return `reaches into ${owner} by path: import it by its package name, so its exports map applies`;
    // The name alone proves nothing: a tsconfig `paths` entry can be spelled like the package. The
    // resolver that reads no tsconfig reaches the package the way node does, through its exports map.
    const plain = resolverWith().sync(dirname(join(root, from)), specifier);
    const sameFile = plain.path !== undefined && toPosix(relative(root, plain.path)) === to;
    return sameFile ? null : `reaches into ${owner} through a path alias, not through its exports map`;
  }

  function resolveTarget(specifier: string, from: string, typeOnly: boolean): Resolved | string {
    const name = packageName(specifier);
    // The resolver is asked before the spelling is believed: a path alias can look like a package
    // ("feat/x") or like a Node built-in ("util").
    const result = resolverFor(from).sync(dirname(join(root, from)), specifier);
    const rel = result.path ? toPosix(relative(root, result.path)) : null;
    const installed = rel !== null && rel.split("/").includes("node_modules");
    if (rel !== null && !installed && !rel.startsWith("..")) {
      const zone = classify(rel);
      return { target: zone === null ? { kind: "unzoned", rel } : { kind: "zone", zone }, rel };
    }
    // Anywhere but on a file of the repo, a built-in's name means the built-in, as it does to Node.
    if (isBuiltin(specifier)) return { target: { kind: "builtin", name: specifier }, rel: null };
    if (!result.path) {
      // Not installed, or a subpath the package does not export: an outside package, judged by its
      // name. Under refuseUnresolved only a type-only import is, which may name a package that has
      // types and no code (topojson-specification).
      const outside = name !== null && !workspace.has(name);
      if (outside && (typeOnly || options.refuseUnresolved !== true)) return { target: { kind: "package", name }, rel: null };
      return `cannot resolve ${specifier}: ${result.error ?? "unknown error"}`;
    }
    if (name === null) return `${specifier} resolves outside the repo`;
    // What is installed says what it is, in its own manifest: an npm alias or a tsconfig alias can
    // spell any package anyhow. With no manifest to read, the spelling stands.
    const manifest = installed ? installedManifest(result.path, manifestIn) : null;
    if (manifest === null) return { target: { kind: "package", name }, rel: null };
    return { target: { kind: "package", name: manifest.name, native: requiresReactNative(manifest) }, rel: null };
  }
}

/** What a specifier resolved to: the target the rules judge and, for a file inside the repo, its repo-relative path. */
interface Resolved {
  target: Target;
  rel: string | null;
}

/** The fields of a package.json the scan reads. */
interface Manifest {
  name?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}
type NamedManifest = Manifest & { name: string };

/** A folder's package.json, or null when it has none. */
function readManifest(dir: string): Manifest | null {
  const file = join(dir, "package.json");
  // A package.json saved with a byte-order mark would otherwise crash JSON.parse.
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) : null;
}

/**
 * The manifest of the installed package that `resolved` belongs to. `resolved` is the file an import
 * landed on, somewhere under a node_modules folder; the manifest is the first one above that file
 * that has a name, so a nested package.json holding only {"type": "module"} is passed over. Null
 * when no folder up to node_modules has one.
 */
function installedManifest(resolved: string, manifestIn: (dir: string) => Manifest | null): NamedManifest | null {
  for (let dir = dirname(resolved); basename(dir) !== "node_modules"; dir = dirname(dir)) {
    const manifest = manifestIn(dir);
    if (hasName(manifest)) return manifest;
  }
  return null;
}

function hasName(manifest: Manifest | null): manifest is NamedManifest {
  return manifest?.name !== undefined;
}

/**
 * Whether a package cannot work without React Native: its manifest lists react-native as a
 * dependency, or as a peer that is not marked optional.
 */
function requiresReactNative(manifest: Manifest): boolean {
  if (manifest.dependencies?.["react-native"] !== undefined) return true;
  return manifest.peerDependencies?.["react-native"] !== undefined && manifest.peerDependenciesMeta?.["react-native"]?.optional !== true;
}

/** `read`, remembering its answer for each key. */
function cached<T>(read: (key: string) => T): (key: string) => T {
  const answers = new Map<string, T>();
  return (key) => {
    if (!answers.has(key)) answers.set(key, read(key));
    return answers.get(key) as T;
  };
}

/**
 * The workspace's own packages, name → repo-relative folder. An import of one resolves to a file
 * and is judged by zone; the folder says which package a file belongs to.
 */
export function workspacePackages(root: string): Map<string, string> {
  const folders = [...LAYER_ROOTS];
  for (const group of PACKAGE_GROUPS) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) folders.push(`${group}/${entry.name}`);
    }
  }
  const packages = new Map<string, string>();
  for (const folder of folders) {
    const name = readManifest(join(root, folder))?.name;
    if (name !== undefined) packages.set(name, folder);
  }
  return packages;
}

/**
 * "@scope/pkg/sub" → "@scope/pkg"; "pkg/sub" → "pkg"; null for a relative or absolute path and for
 * the spellings no package name can take ("@/x", "#x", "~x"). A name is not proof of a package: a
 * path alias can be spelled like one, which is why resolveTarget asks the resolver first.
 */
export function packageName(specifier: string): string | null {
  if (isRelative(specifier) || specifier.startsWith("@/") || specifier.startsWith("#") || specifier.startsWith("~")) return null;
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

/** The scan's own test for a code file: a JavaScript or TypeScript source, not a declaration file. */
export function isCodeFile(name: string): boolean {
  return CODE_FILE.test(name) && !name.endsWith(".d.ts");
}

/** Every code file under a scan root. node_modules and dot-folders are skipped at any depth. */
function* walk(dir: string, isScanRoot = true): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (isScanRoot && BUILD_OUTPUT_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name), false);
    } else if (isCodeFile(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}
