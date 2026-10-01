import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { unscannedCodeFiles } from "./repo";
import { scanRepo, WORKSPACE_LOCATIONS } from "./scan";
import { trackedFiles } from "./tracked";

const root = fileURLToPath(new URL("../../..", import.meta.url));

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
  const { violations, scannedFiles } = scanRepo({ root, tsconfigs: TSCONFIGS });

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
