import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { exportsProblems, trackedRegistryFiles, unregisteredAliasConfigs, unscannedCodeFiles } from "./repo";
import { scanRepo, WORKSPACE_LOCATIONS, workspacePackages } from "./scan";
import { trackedFiles } from "./tracked";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const packageDir = fileURLToPath(new URL("..", import.meta.url));

// Path aliases come from each folder's own tsconfig.json (apps/web's "@/*"). Every one that exists
// is registered, so a tsconfig that gains `paths` later is already being read.
const TSCONFIG_DIRS = ["apps/web", "apps/mobile", "features", "platform", "reference"];
const TSCONFIGS = Object.fromEntries(
  TSCONFIG_DIRS.filter((dir) => existsSync(join(root, dir, "tsconfig.json"))).map((dir) => [dir, `${dir}/tsconfig.json`]),
);

// Tracked code files the rules govern that the scan leaves out on purpose, in the order git lists
// them. Exact paths only, each with its reason: a pattern here would also hide the next file that
// matches it.
const UNSCANNED_ON_PURPOSE = [
  "apps/mobile/app.config.js", // Expo's config: it runs in Node, not in the app
];

describe("this repo's imports", () => {
  // Every package is installed here, so a value import that resolves nowhere is a violation.
  const { violations, scannedFiles } = scanRepo({ root, tsconfigs: TSCONFIGS, refuseUnresolved: true });

  // A clean result only means something if the scan reached the code: check
  // for files it must see, and a floor well under today's count.
  it("reach the whole web app and the mobile app", () => {
    expect(scannedFiles).toContain("apps/web/proxy.ts");
    expect(scannedFiles).toContain("apps/web/app/layout.tsx");
    expect(scannedFiles).toContain("apps/web/lib/server/store.ts");
    expect(scannedFiles).toContain("apps/mobile/src/app/index.tsx");
    expect(scannedFiles).toContain("apps/mobile/tests/home.test.tsx");
    expect(scannedFiles.length).toBeGreaterThan(300);
  });

  it("are resolved through both apps' tsconfigs", () => {
    expect(TSCONFIGS).toMatchObject({ "apps/web": "apps/web/tsconfig.json", "apps/mobile": "apps/mobile/tsconfig.json" });
  });

  // Fails closed: a tracked code file in a folder the walk skips (a feature named "coverage", a new
  // dot-folder), beside the scan roots (apps/mobile/lib/…) or in an app the scan has no root for is
  // named here instead of going unchecked. So is an entry of the list above that has gone stale.
  it("reach every tracked code file the rules govern", () => {
    const tracked = trackedFiles(root);
    expect(tracked).toContain("apps/web/proxy.ts");
    expect(unscannedCodeFiles(tracked, scannedFiles)).toEqual(UNSCANNED_ON_PURPOSE);
  });

  it("cross no zone boundary", () => {
    expect(violations).toEqual([]);
  });
});

describe("this repo's workspace", () => {
  // The scan looks for the workspace's own packages in a fixed list of places. One that lives
  // anywhere else is not a package to it: its name is not known, and a path into it crosses no
  // package boundary.
  it("keeps its packages where the scan looks for them", () => {
    const listed: unknown = parse(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")).packages;
    if (!Array.isArray(listed) || listed.length === 0) throw new Error("pnpm-workspace.yaml has no packages list");
    const unknown = listed.filter((location) => !WORKSPACE_LOCATIONS.includes(location));
    expect(unknown, "pnpm-workspace.yaml lists a location the boundary scan does not know: teach workspacePackages() in scan.ts").toEqual([]);
  });

  // The scan's resolver takes one branch of a conditional target, and a bundler may take another.
  it("gives each entry of a package's exports one plain string", () => {
    const packages = [...workspacePackages(root)];
    expect(packages.map(([name]) => name)).toEqual(expect.arrayContaining(["@tsa/features", "@tsa/platform"]));
    const exportsOf = (folder: string): unknown => JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8")).exports;
    expect(packages.flatMap(([name, folder]) => exportsProblems(name, exportsOf(folder)))).toEqual([]);
  });
});

describe("this repo's tracked files", () => {
  const tracked = trackedFiles(root);
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  // tools/registry-gen writes those folders and git ignores them. A file committed there by hand
  // (it takes `git add -f`) would be taken for generated code, which may import any feature's parts.
  it("hold nothing inside a generated registry folder", () => {
    expect(trackedRegistryFiles(tracked)).toEqual([]);
  });

  // A tsconfig the scan does not read can still give TypeScript and a bundler an alias. The second
  // line shows that the check has something to find: with nothing registered, it names apps/web's
  // tsconfig for its "@/*".
  it("declare path aliases only in a tsconfig the scan reads", () => {
    expect(unregisteredAliasConfigs(tracked, Object.values(TSCONFIGS), read)).toEqual([]);
    expect(unregisteredAliasConfigs(tracked, [], read)).toEqual(["apps/web/tsconfig.json"]);
  });
});

// ci.test.ts checks that every test file the CI workflow runs by name exists. Deleting ci.test.ts
// would take that check with it, so the other two files are looked for from here as well.
describe("the test files the CI workflow runs by name beside this one", () => {
  it("exist", () => {
    const missing = ["src/ci.test.ts", "src/lockfile.test.ts"].filter((file) => !existsSync(join(packageDir, file)));
    expect(missing).toEqual([]);
  });
});

// The checks above, each shown an input that is wrong in one way.
describe("unscannedCodeFiles", () => {
  const scanned = ["apps/web/page.tsx", "features/money/core/split.ts"];

  it.each<[string, string, boolean]>([
    ["a file the scan read", "apps/web/page.tsx", false],
    ["a file under a scan root that the walk skipped", "features/coverage/core/x.ts", true],
    ["a file at a layer's root, which is in no zone", "features/helpers.ts", true],
    ["a file beside the mobile app's scan roots", "apps/mobile/lib/bridge.ts", true],
    ["a file at the mobile app's root", "apps/mobile/app.config.js", true],
    ["a file of an app the scan has no root for", "apps/admin/src/a.ts", true],
    ["a declaration file", "features/money/core/evil.d.ts", false],
    ["a file that is not code", "apps/mobile/app.json", false],
    ["a tool's own source", "tools/boundaries/src/scan.ts", false],
    ["a file at the repo's root", "vitest.config.ts", false],
  ])("%s: %s", (_name, rel, named) => {
    expect(unscannedCodeFiles([rel], scanned)).toEqual(named ? [rel] : []);
  });
});

describe("trackedRegistryFiles", () => {
  it.each<[string, string, boolean]>([
    ["a file in the features registry", "features/_registry/server.ts", true],
    ["a file nested in it", "features/_registry/mobile/core/index.ts", true],
    ["a file in the platform registry that is not code", "platform/_registry/.gitkeep", true],
    ["a file in reference/_registry, which is no registry", "reference/_registry/server.ts", false],
    ["a feature's own file", "features/money/server/index.ts", false],
    ["the generator itself", "tools/registry-gen/generate.mjs", false],
  ])("%s: %s", (_name, rel, named) => {
    expect(trackedRegistryFiles([rel])).toEqual(named ? [rel] : []);
  });
});

describe("exportsProblems", () => {
  const branches = "the scan's resolver and a bundler may take different branches";

  it.each<[string, unknown]>([
    ["no exports at all", undefined],
    ["one entry, written as a string", "./index.ts"],
    ["a map from subpaths to strings", { ".": "./index.ts", "./*/core": "./*/core/index.ts" }],
  ])("finds nothing wrong with %s", (_name, exports) => {
    expect(exportsProblems("@fx/pkg", exports)).toEqual([]);
  });

  it.each<[string, unknown, string[]]>([
    [
      "a conditional target",
      { "./*/core": "./*/core/index.ts", "./*/api": { node: "./*/core/index.ts", default: "./*/server/index.ts" } },
      [`@fx/pkg: exports["./*/api"] is {"node":"./*/core/index.ts","default":"./*/server/index.ts"}, not one plain string: ${branches}`],
    ],
    [
      "conditions at the top level",
      { import: "./index.mjs", default: "./index.cjs" },
      [`@fx/pkg: exports["import"] is a condition, not a subpath: ${branches}`, `@fx/pkg: exports["default"] is a condition, not a subpath: ${branches}`],
    ],
    ["an array of fallbacks as a target", { ".": ["./a.ts", "./b.ts"] }, [`@fx/pkg: exports["."] is ["./a.ts","./b.ts"], not one plain string: ${branches}`]],
    ["a null target", { "./internal/*": null }, [`@fx/pkg: exports["./internal/*"] is null, not one plain string: ${branches}`]],
    ["an array in place of the map", ["./a.ts", "./b.ts"], ['@fx/pkg: exports is ["./a.ts","./b.ts"], not a string or a map from subpaths to strings']],
    ["null in place of the map", null, ["@fx/pkg: exports is null, not a string or a map from subpaths to strings"]],
  ])("reports %s", (_name, exports, problems) => {
    expect(exportsProblems("@fx/pkg", exports)).toEqual(problems);
  });
});

describe("unregisteredAliasConfigs", () => {
  const PATHS = '{ "compilerOptions": { "paths": { "feat/*": ["../*"] } } }';
  const BASE_URL = '{\n  // a comment, which JSON.parse would refuse\n  "compilerOptions": { "baseUrl": "../.." }\n}';
  const PLAIN = '{ "compilerOptions": { "strict": true } }';
  const registered = ["apps/web/tsconfig.json", "features/tsconfig.json"];

  it.each<[string, string, string, boolean]>([
    ["a registered tsconfig, aliases and all", "apps/web/tsconfig.json", PATHS, false],
    ["a registered layer tsconfig", "features/tsconfig.json", BASE_URL, false],
    ["a feature's own tsconfig that declares paths", "features/money/tsconfig.json", PATHS, true],
    ["a module's own tsconfig that declares baseUrl", "platform/sync/tsconfig.json", BASE_URL, true],
    ["a second tsconfig beside a registered one", "apps/web/tsconfig.e2e.json", PATHS, true],
    ["a layer's tsconfig that nobody registered", "reference/tsconfig.json", PATHS, true],
    ["a third app's tsconfig", "apps/admin/tsconfig.json", PATHS, true],
    ["a tsconfig that declares no alias", "features/money/tsconfig.json", PLAIN, false],
    ["a tool's tsconfig, which no zoned code reads", "tools/boundaries/tsconfig.json", PATHS, false],
    ["a tsconfig at the repo's root", "tsconfig.base.json", PATHS, false],
    ["a file that is not a tsconfig", "features/money/core/paths.json", PATHS, false],
  ])("%s: %s", (_name, rel, text, named) => {
    expect(unregisteredAliasConfigs([rel], registered, () => text)).toEqual(named ? [rel] : []);
  });
});
