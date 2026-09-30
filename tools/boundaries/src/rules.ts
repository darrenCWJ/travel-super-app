import type { Part, Zone } from "./zones";

/** What an import points at, once resolved. */
export type Target =
  | { kind: "zone"; zone: Zone }
  | { kind: "unzoned"; rel: string } // inside the repo, but in no zone (a stray file, a tools/ script)
  | { kind: "package"; name: string } // an npm package outside the workspace
  | { kind: "builtin"; name: string }; // node:fs, fs, …

const isReact = (p: string) => p === "react";
const isReactDom = (p: string) => p === "react-dom";
const isReactNative = (p: string) =>
  p === "react-native" || p.startsWith("react-native-") || p.startsWith("@react-native/") || p.startsWith("@react-native-");
const isExpo = (p: string) => p === "expo" || p.startsWith("expo-") || p.startsWith("@expo/");
const isNext = (p: string) => p === "next" || p.startsWith("@next/");
const isDrizzle = (p: string) => p === "drizzle-orm";

interface PackageRule {
  banned: ((name: string) => boolean)[];
  builtins: boolean;
}

/** Packages each part may not use (spec §0's "Never" column). Tests and registries are unrestricted. */
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

/** Parts each app may import directly (route files are one-line re-exports; spec §0). */
const APP_PARTS: Record<string, Part[]> = {
  web: ["core", "client", "server", "web", "registry"],
  mobile: ["core", "client", "mobile", "registry"],
};

/** Why `from` may not import `to`, or null when it may. */
export function checkEdge(from: Zone, to: Target): string | null {
  if (to.kind === "package" || to.kind === "builtin") return checkPackage(from, to);
  if (to.kind === "unzoned") return `imports ${to.rel}, which is in no zone`;
  return checkZone(from, to.zone);
}

function checkPackage(from: Zone, to: Extract<Target, { kind: "package" | "builtin" }>): string | null {
  const key = from.layer === "app" ? (`app:${from.owner}` as const) : from.part;
  if (key === null) return null; // reported once, as "file is in no part folder"
  if (from.part === "manifest") return `a manifest imports only registry types, not ${to.name}`;
  const rule = PACKAGE_RULES[key as keyof typeof PACKAGE_RULES];
  if (rule === undefined) return null;
  if (to.kind === "builtin") return rule.builtins ? null : `${describe(from)} may not use Node built-in ${to.name}`;
  return rule.banned.some((test) => test(to.name)) ? `${describe(from)} may not import ${to.name}` : null;
}

function checkZone(from: Zone, to: Zone): string | null {
  const sameOwner = from.layer === to.layer && from.owner === to.owner;
  if (to.layer === "app") return from.layer === "app" && sameOwner ? null : `nothing imports into apps/${to.owner}`;
  if (to.part === "registry") return from.layer === "app" ? null : "only the apps import the generated registry";
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

function describe(zone: Zone): string {
  if (zone.layer === "app") return `apps/${zone.owner}`;
  return `${zone.part} code`;
}
