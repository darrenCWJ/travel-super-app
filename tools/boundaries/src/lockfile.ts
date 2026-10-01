import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { satisfies } from "semver";
import { parse } from "yaml";

/**
 * Checks on pnpm-lock.yaml that `expo install --check` cannot make: it reads only the mobile app's
 * direct dependencies, so a second react-dom, or a native module at a version this Expo SDK does
 * not expect, arriving as another package's dependency or peer, passes it.
 */

/** The whole workspace runs on one version of each of these (spec §0, and the catalog in pnpm-workspace.yaml). */
const ONE_VERSION = ["react", "react-dom", "react-native"];
/** The two apps share logic and never screens (spec §0), so this is never installed. */
const NEVER_INSTALLED = "react-native-web";
/** Where the installed Expo SDK lists the version it expects of each native module, from the repo root. */
const BUNDLED_NATIVE_MODULES = "apps/mobile/node_modules/expo/bundledNativeModules.json";

/**
 * The versions the lockfile holds of each package, from the keys of its `packages:` section
 * ("name@version"; a peer suffix in brackets, as `snapshots:` writes them, is dropped).
 */
export function lockedVersions(lockfileText: string): Map<string, string[]> {
  const packages: unknown = parse(lockfileText)?.packages;
  if (packages === null || typeof packages !== "object") throw new Error("the lockfile has no packages section");
  const versions = new Map<string, string[]>();
  for (const key of Object.keys(packages)) {
    const plain = key.replace(/\(.*$/, "");
    const at = plain.lastIndexOf("@");
    // "@scope/name" has its only "@" at 0: a key with no version is a format this does not know.
    if (at <= 0) throw new Error(`cannot read "${key}" in the lockfile's packages section as name@version`);
    const name = plain.slice(0, at);
    versions.set(name, [...(versions.get(name) ?? []), plain.slice(at + 1)]);
  }
  return versions;
}

/**
 * What is wrong with a pnpm lockfile, one sentence per problem. `bundled` is Expo's
 * bundledNativeModules.json: package name → the version range this SDK expects. A package the
 * lockfile does not hold is not looked up, and one the SDK does not list is not judged.
 */
export function lockfileProblems(lockfileText: string, bundled: Record<string, string>): string[] {
  const locked = lockedVersions(lockfileText);
  const problems: string[] = [];
  for (const name of ONE_VERSION) {
    const versions = locked.get(name) ?? [];
    if (versions.length !== 1) {
      problems.push(`expected exactly one version of ${name} in the lockfile, found ${versions.length === 0 ? "none" : versions.join(" and ")}`);
    }
  }
  for (const version of locked.get(NEVER_INSTALLED) ?? []) {
    problems.push(`${NEVER_INSTALLED}@${version} is in the lockfile: nothing uses ${NEVER_INSTALLED} (spec §0)`);
  }
  for (const [name, range] of Object.entries(bundled)) {
    if (name === NEVER_INSTALLED) continue; // already reported, whatever its version
    for (const version of locked.get(name) ?? []) {
      if (!satisfies(version, range)) problems.push(`${name}@${version} is in the lockfile, but this Expo SDK expects ${range}`);
    }
  }
  return problems;
}

/**
 * Expo's bundledNativeModules.json, read from the installed SDK under `root`. It throws when the
 * file is not there: a check that cannot see the SDK's list has to fail, not pass without it.
 */
export function readBundledNativeModules(root: string): Record<string, string> {
  const file = join(root, BUNDLED_NATIVE_MODULES);
  if (!existsSync(file)) throw new Error(`${file} is missing: install the workspace (pnpm install) before running this check`);
  return JSON.parse(readFileSync(file, "utf8"));
}
