import { isCodeFile, SCAN_ROOTS } from "./scan";
import { classify, ZONED_ROOTS } from "./zones";

/**
 * Checks on the repo's own files that the import scan takes for granted, as pure functions so that
 * each can be shown a broken input without a real file being edited. repo.test.ts runs them on
 * this repo.
 */

/**
 * The tracked code files the boundary rules govern that the scan did not read. A file is governed
 * when it sits under a scan root, or when `classify` puts it in a zone: that second half names the
 * code beside the scan roots (apps/mobile/lib/…) and the code of an app the scan has no root for.
 */
export function unscannedCodeFiles(tracked: string[], scannedFiles: string[]): string[] {
  const scanned = new Set(scannedFiles);
  const governed = (rel: string) => SCAN_ROOTS.some((scanRoot) => rel.startsWith(`${scanRoot}/`)) || classify(rel) !== null;
  return tracked.filter((rel) => isCodeFile(rel) && governed(rel) && !scanned.has(rel));
}

/**
 * The tracked files inside a generated registry folder (features/_registry, platform/_registry),
 * code or not. To the scan every file there is generated code.
 */
export function trackedRegistryFiles(tracked: string[]): string[] {
  return tracked.filter((rel) => classify(rel)?.part === "registry");
}

/**
 * What is wrong with the `exports` of the workspace package `name`. It may be missing, one string,
 * or a map from subpaths to strings: with a conditional object, an array of fallbacks or null as a
 * target, the scan's resolver and a bundler may each follow a different branch.
 */
export function exportsProblems(name: string, exports: unknown): string[] {
  if (exports === undefined || typeof exports === "string") return [];
  if (exports === null || typeof exports !== "object" || Array.isArray(exports)) {
    return [`${name}: exports is ${JSON.stringify(exports)}, not a string or a map from subpaths to strings`];
  }
  const why = "the scan's resolver and a bundler may take different branches";
  return Object.entries(exports).flatMap(([key, target]) => {
    if (!key.startsWith(".")) return [`${name}: exports["${key}"] is a condition, not a subpath: ${why}`];
    return typeof target === "string" ? [] : [`${name}: exports["${key}"] is ${JSON.stringify(target)}, not one plain string: ${why}`];
  });
}

const TSCONFIG_FILE = /(^|\/)tsconfig[^/]*\.json$/;
// Looked for in the text, not in the parsed file: a tsconfig may hold comments, and a false alarm is loud.
const ALIAS_KEYS = ['"paths"', '"baseUrl"'];

/**
 * The tracked tsconfig*.json files under a zoned folder that declare path aliases and are not among
 * the ones registered with the scan: TypeScript and a bundler would follow aliases the scan never
 * reads. `read` gives a tracked file's text.
 */
export function unregisteredAliasConfigs(tracked: string[], registered: string[], read: (rel: string) => string): string[] {
  const zoned = (rel: string) => ZONED_ROOTS.some((folder) => rel.startsWith(`${folder}/`));
  const declaresAliases = (rel: string) => {
    const text = read(rel);
    return ALIAS_KEYS.some((key) => text.includes(key));
  };
  return tracked.filter((rel) => TSCONFIG_FILE.test(rel) && zoned(rel) && !registered.includes(rel) && declaresAliases(rel));
}
