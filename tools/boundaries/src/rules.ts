import type { Part, Zone } from "./zones";

/** What an import points at, once resolved. */
export type Target =
  | { kind: "zone"; zone: Zone }
  | { kind: "unzoned"; rel: string } // inside the repo, but in no zone (a stray file, a tools/ script)
  // An npm package outside the workspace. The scan reads the installed package's own manifest:
  // `name` is the name it gives itself (the specifier's spelling when there is no manifest to read),
  // and `native` says that it requires react-native, which a name such as @shopify/flash-list does not.
  | { kind: "package"; name: string; native?: boolean }
  | { kind: "builtin"; name: string }; // node:fs, fs, …

type Package = Extract<Target, { kind: "package" }>;

/** "@scope/name" → ["@scope", "name"]; "name" → [null, "name"]. */
function splitScope(name: string): [scope: string | null, bare: string] {
  const slash = name.indexOf("/");
  return name.startsWith("@") && slash !== -1 ? [name.slice(0, slash), name.slice(slash + 1)] : [null, name];
}

const isReact = (p: Package) => p.name === "react";
const isReactDom = (p: Package) => p.name === "react-dom";
// The React Native family. By manifest: `native` (see Target). By name: react-native and
// react-native-<x>, alone or in any scope; a scoped name that ends -react-native; and everything in
// the scopes @react-native, @react-native-<x> and @react-navigation.
const isReactNative = (p: Package) => {
  if (p.native === true) return true;
  const [scope, bare] = splitScope(p.name);
  if (scope === "@react-native" || scope?.startsWith("@react-native-") || scope === "@react-navigation") return true;
  if (bare === "react-native" || bare.startsWith("react-native-")) return true;
  return scope !== null && bare.endsWith("-react-native");
};
// The Expo family, by name: expo itself, expo-<x> alone or in any scope, and everything in the scope
// @expo. A scoped package named exactly expo is not in it: the server imports @better-auth/expo's
// root (spec §0), so such a package is judged by its manifest like any other.
// That package's /client entry is the phone's: the rule for it belongs to the phase 1 identity work.
const isExpo = (p: Package) => {
  const [scope, bare] = splitScope(p.name);
  if (scope === "@expo" || bare.startsWith("expo-")) return true;
  return scope === null && bare === "expo";
};
const isNext = (p: Package) => p.name === "next" || p.name.startsWith("@next/");
const isDrizzle = (p: Package) => p.name === "drizzle-orm";

interface PackageRule {
  banned: ((pkg: Package) => boolean)[];
  builtins: boolean;
}

/**
 * Packages each part may not use (spec §0's "Never" column). Registries have no entry, and a test
 * never gets as far as this table: the one package either may not use is react-native-web, which
 * checkPackage refuses for everyone.
 */
const PACKAGE_RULES: Partial<Record<Part | "app:web" | "app:mobile", PackageRule>> = {
  core: { banned: [isReact, isReactDom, isReactNative, isExpo, isNext, isDrizzle], builtins: false },
  client: { banned: [isReactDom, isReactNative, isExpo, isNext, isDrizzle], builtins: false },
  server: { banned: [isReact, isReactDom, isReactNative, isExpo], builtins: true },
  db: { banned: [isReact, isReactDom, isReactNative, isExpo, isNext], builtins: true },
  web: { banned: [isReactNative, isExpo, isDrizzle], builtins: true },
  mobile: { banned: [isReactDom, isNext, isDrizzle], builtins: false },
  "app:web": { banned: [isReactNative, isExpo], builtins: true },
  "app:mobile": { banned: [isReactDom, isNext, isDrizzle], builtins: false },
};

/** Which parts each part may import, before the ownership rules narrow it (spec §0 "May import"). */
const PART_RULES: Record<Exclude<Part, "test" | "registry" | "manifest">, Part[]> = {
  core: ["core"],
  client: ["core", "client"],
  server: ["core", "server", "db"],
  db: ["core", "db"],
  web: ["core", "client", "web"],
  mobile: ["core", "client", "mobile"],
};

/** Parts each app may import directly (route files are one-line re-exports; spec §0). The registry is judged by kind, below. */
const APP_PARTS: Record<string, Part[]> = {
  web: ["core", "client", "server", "web"],
  mobile: ["core", "client", "mobile"],
};

/**
 * Generated registry files each app may import, by kind (the file's base name). Both apps are
 * composition roots, but each reads only its own zone's files: the phone has no server registry.
 */
const APP_REGISTRIES: Record<string, string[]> = {
  web: ["manifests", "client", "server", "web"],
  mobile: ["manifests", "client", "mobile"],
};

/** Why `from` may not import `to`, or null when it may. */
export function checkEdge(from: Zone, to: Target): string | null {
  if (to.kind === "package" || to.kind === "builtin") return checkPackage(from, to);
  if (to.kind === "unzoned") return `imports ${to.rel}, which is in no zone`;
  return checkZone(from, to.zone);
}

function checkPackage(from: Zone, to: Extract<Target, { kind: "package" | "builtin" }>): string | null {
  // First, because it holds for everyone: for tests and registries, which have no other package
  // rule, and on the mobile side, where the rest of the React Native family is allowed.
  if (to.kind === "package" && to.name === "react-native-web") return "nothing uses react-native-web (spec §0)";
  // A test may use any other package and any built-in, whatever the layer: an app's tests too.
  if (from.part === "test") return null;
  const key = from.layer === "app" ? (`app:${from.owner}` as const) : from.part;
  if (key === null) return null; // reported once, as "file is in no part folder"
  if (from.part === "manifest") return `a manifest imports only registry types, not ${to.name}`;
  const rule = PACKAGE_RULES[key as keyof typeof PACKAGE_RULES];
  if (rule === undefined) return null;
  if (to.kind === "builtin") return rule.builtins ? null : `${describe(from)} may not use Node built-in ${to.name}`;
  return rule.banned.some((test) => test(to)) ? `${describe(from)} may not import ${to.name}` : null;
}

function checkZone(from: Zone, to: Zone): string | null {
  const sameOwner = from.layer === to.layer && from.owner === to.owner;
  if (to.layer === "app") return from.layer === "app" && sameOwner ? null : `nothing imports into apps/${to.owner}`;
  if (to.part === "registry") return checkRegistry(from, to);
  // Generated code: it imports every feature's parts by design, and only the apps import it.
  if (from.part === "registry") return null;

  if (from.layer === "app") {
    const allowed = APP_PARTS[from.owner] ?? [];
    return to.part !== null && allowed.includes(to.part) ? null : `apps/${from.owner} may not import ${to.part ?? "stray"} code`;
  }
  if (from.layer === "feature" && to.layer === "feature" && !sameOwner) return "features never import each other";
  if (from.layer === "platform" && to.layer === "feature") return "the platform never imports a feature";
  if (from.layer === "reference" && to.layer !== "reference") return "reference imports only reference";
  if (from.part === "test" || from.part === null) return null;

  if (from.part === "manifest") {
    return to.layer === "platform" && to.owner === "registry" && to.part === "core"
      ? null
      : "a manifest imports only registry types";
  }
  if (to.part === null || !PART_RULES[from.part].includes(to.part)) return `${describe(from)} may not import ${to.part ?? "stray"} code`;
  if (to.part === "db" && !sameOwner && !(from.part === "db" && to.layer === "platform")) {
    return "only a module's own server and db code import its tables";
  }
  return null;
}

function checkRegistry(from: Zone, to: Zone): string | null {
  if (from.layer !== "app") return "only the apps import the generated registry";
  const kind = to.kind ?? "unknown";
  const allowed = APP_REGISTRIES[from.owner] ?? [];
  return allowed.includes(kind) ? null : `apps/${from.owner} may not import the ${kind} registry`;
}

function describe(zone: Zone): string {
  if (zone.layer === "app") return `apps/${zone.owner}`;
  return `${zone.part} code`;
}
