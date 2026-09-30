/** Where a file sits in the monorepo (spec §0 "Feature zones"). */
export type Layer = "feature" | "platform" | "reference" | "app";
export type Part = "manifest" | "core" | "client" | "server" | "db" | "web" | "mobile" | "test" | "registry";

export interface Zone {
  layer: Layer;
  /** feature or module name ("money", "sync", "countries"), or the app name ("web", "mobile") */
  owner: string;
  /** null for app files and for layered files outside a known part folder */
  part: Part | null;
  /** Set only for generated registry files: the file's base name ("manifests", "client", "server", "web", "mobile"). */
  kind?: string;
}

const LAYERS: Record<string, Layer> = { features: "feature", platform: "platform", reference: "reference" };
const PART_DIRS = new Set<Part>(["core", "client", "server", "db", "web", "mobile"]);
const TEST_DIRS = new Set(["tests", "e2e"]);
export const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Classify a repo-relative POSIX path. Returns null for files the boundary rules
 * do not govern: repo-root files, tools/, docs/, and a layer package's own config
 * files (features/package.json, platform/vitest.config.ts …).
 */
export function classify(rel: string): Zone | null {
  const seg = rel.split("/");
  if (seg[0] === "apps" && seg.length >= 3) return { layer: "app", owner: seg[1], part: null };
  const layer = LAYERS[seg[0]];
  if (layer === undefined || seg.length < 3) return null;
  const owner = seg[1];
  if (owner === "_registry") return { layer, owner, part: "registry", kind: seg[2].replace(/\.[^.]+$/, "") };
  if (TEST_FILE.test(rel) || TEST_DIRS.has(seg[2])) return { layer, owner, part: "test" };
  if (layer === "feature" && seg.length === 3 && /^manifest\.[cm]?[jt]s$/.test(seg[2])) {
    return { layer, owner, part: "manifest" };
  }
  const part = seg[2] as Part;
  return { layer, owner, part: PART_DIRS.has(part) ? part : null };
}
