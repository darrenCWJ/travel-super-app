import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isCodeFile, packageName, scanRepo } from "./scan";
import { CODE, withRepo } from "./testRepo";

// A small repo with exactly one violation per "bad" file. Built in a temp folder so no
// deliberately broken code ever sits in the real tree for a type-check or a linter to trip on.
const FIXTURE: Record<string, string> = {
  "platform/package.json": JSON.stringify({
    name: "@fx/platform",
    private: true,
    exports: { "./*/core": "./*/core/index.ts", "./*/client": "./*/client/index.ts", "./*/server": "./*/server/index.ts" },
  }, null, 2),
  "platform/sync/core/index.ts": "export const core = 1;\n",
  "platform/sync/server/index.ts": "export const server = 1;\n",
  "platform/sync/db/index.ts": "export const table = 1;\n",
  "features/package.json": JSON.stringify({ name: "@fx/features", private: true }, null, 2),
  "features/money/core/ok.ts": 'import { core } from "@fx/platform/sync/core";\nimport { z } from "zod";\nimport type { Money } from "./types";\nexport const ok = [core, z];\n',
  "features/money/core/types.ts": "export type Money = number;\n",
  "features/money/core/bad-react.ts": 'import { useState } from "react";\nexport const x = useState;\n',
  "features/money/core/bad-cross.ts": 'import { p } from "../../polls/core/p";\nexport const x = p;\n',
  "features/money/core/bad-unexported.ts": 'import { table } from "@fx/platform/sync/db";\nexport const x = table;\n',
  "features/money/core/load.test.ts": "export const load = (name: string) => import(name);\n",
  "features/money/tests/helper.ts": "export const load = (name: string) => import(name);\n", // tests/ is the test part, whatever the file is called
  "features/money/core/bad-dynamic.ts": "export const load = (name: string) => import(name);\n",
  "features/money/core/bad-builtin.ts": 'const fs = require("node:fs");\nexport const x = fs;\n',
  "features/money/core/bad-equals.ts": 'import server = require("../server/s");\nexport const x = server;\n',
  "features/money/client/bad-server.ts": 'import { server } from "@fx/platform/sync/server";\nexport const x = server;\n',
  "features/money/mobile/bad-context.ts": 'export const ctx = require.context("../..");\n',
  "features/money/server/s.ts": "export const s = 1;\n",
  "features/money/web/Home.tsx": "export const Home = () => <main />;\n",
  "features/money/utils.ts": "export const stray = 1;\n",
  "features/polls/core/p.ts": "export const p = 1;\n",
  "features/_registry/server.ts": "import * as money from '../money/server/s';\nexport const serverParts = { money };\n",
  "apps/web/package.json": JSON.stringify({ name: "@fx/web", private: true }, null, 2),
  "apps/web/page.tsx": 'import { Home } from "@fx/features/money/web/Home";\nimport "react-native";\nexport default Home;\n',
  "apps/mobile/package.json": JSON.stringify({ name: "@fx/mobile", private: true }, null, 2),
  "apps/mobile/src/index.tsx": 'import { s } from "../../../features/money/server/s";\nexport default s;\n',
};

let fixture: string;

// pnpm links workspace packages into node_modules; a junction does the same here without admin rights.
beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), "boundaries-"));
  for (const [rel, content] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(fixture, rel)), { recursive: true });
    writeFileSync(join(fixture, rel), content);
  }
  mkdirSync(join(fixture, "node_modules", "@fx"), { recursive: true });
  symlinkSync(join(fixture, "platform"), join(fixture, "node_modules", "@fx", "platform"), "junction");
  symlinkSync(join(fixture, "features"), join(fixture, "node_modules", "@fx", "features"), "junction");
});
afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe("scanRepo on the fixture repo", () => {
  it("reports exactly one violation per bad file, and nothing for the good ones", () => {
    const found = scanRepo({ root: fixture }).violations.map((v) => [v.file, v.line, v.reason]);
    expect(found).toEqual([
      ["apps/mobile/src/index.tsx", 1, "apps/mobile may not import server code"],
      ["apps/web/page.tsx", 2, "apps/web may not import react-native"],
      ["features/money/client/bad-server.ts", 1, "client code may not import server code"],
      ["features/money/core/bad-builtin.ts", 1, "core code may not use Node built-in node:fs"],
      ["features/money/core/bad-cross.ts", 1, "features never import each other"],
      ["features/money/core/bad-dynamic.ts", 1, "an import or require with a computed specifier cannot be checked"],
      ["features/money/core/bad-equals.ts", 1, "core code may not import server code"],
      ["features/money/core/bad-react.ts", 1, "core code may not import react"],
      ["features/money/core/bad-unexported.ts", 1, expect.stringContaining('"./sync/db" is not exported')],
      ["features/money/mobile/bad-context.ts", 1, "require.context bypasses the generated registry"],
      ["features/money/utils.ts", 1, "file is in no part folder (core, client, server, db, web, mobile, tests)"],
    ]);
  });
});

describe("scanRepo coverage", () => {
  it("lists every governed file it scanned, and skips the ungoverned ones", () => {
    const { scannedFiles } = scanRepo({ root: fixture });
    expect(scannedFiles).toContain("features/money/core/ok.ts");
    expect(scannedFiles).toContain("apps/web/page.tsx");
    expect(scannedFiles).toContain("apps/mobile/src/index.tsx");
    expect(scannedFiles).not.toContain("features/package.json");
    expect(scannedFiles).toContain("features/_registry/server.ts");
    expect(scannedFiles).toContain("features/money/tests/helper.ts");
    expect(scannedFiles).toHaveLength(22);
  });
});

// Each describe below builds its own small repos: the one above is shared and its violation list is exact.
describe("scanRepo: which folders are walked", () => {
  // A feature cannot be named after build output: `features/<name>` is skipped like `apps/web/<name>`.
  // repo.test.ts is what catches that, by naming any tracked file the walk left out.
  it.each(["dist", "build", "coverage", "android", "ios", "playwright-report", "test-results"])(
    "skips %s directly under a scan root, and walks it anywhere deeper",
    (name) => {
      const files = {
        [`apps/web/${name}/x.ts`]: CODE,
        [`features/${name}/core/x.ts`]: CODE,
        [`apps/web/lib/${name}/x.ts`]: CODE,
        [`features/money/web/${name}/x.ts`]: CODE,
      };
      withRepo(files, (root) => {
        expect(scanRepo({ root }).scannedFiles).toEqual([`apps/web/lib/${name}/x.ts`, `features/money/web/${name}/x.ts`]);
      });
    },
  );

  it("skips node_modules and dot-folders at any depth", () => {
    const files = {
      "apps/web/node_modules/x/index.ts": CODE,
      "apps/web/lib/node_modules/x/index.ts": CODE,
      "apps/web/.next/x.ts": CODE,
      "features/.turbo/core/x.ts": CODE,
      "features/money/core/.cache/x.ts": CODE,
      "features/money/core/kept.ts": CODE,
    };
    withRepo(files, (root) => {
      expect(scanRepo({ root }).scannedFiles).toEqual(["features/money/core/kept.ts"]);
    });
  });

  // Spec §0 serves universal links and app links from apps/web/src/app/.well-known.
  it("walks .well-known, the one dot-folder that holds routes and not a tool's output", () => {
    withRepo({ "apps/web/app/.well-known/assetlinks.json/route.ts": CODE }, (root) => {
      expect(scanRepo({ root }).scannedFiles).toEqual(["apps/web/app/.well-known/assetlinks.json/route.ts"]);
    });
  });

  it("scans the mobile app's tests folder, and leaves its root-level config files alone", () => {
    const files = {
      "features/money/server/s.ts": "export const s = 1;\n",
      "apps/mobile/tests/x.test.tsx": 'import { s } from "../../../features/money/server/s";\nexport default s;\n',
      "apps/mobile/metro.config.js": 'const path = require("node:path");\nmodule.exports = { path };\n',
    };
    withRepo(files, (root) => {
      const { scannedFiles, violations } = scanRepo({ root });
      expect(scannedFiles).toEqual(["apps/mobile/tests/x.test.tsx", "features/money/server/s.ts"]);
      expect(violations.map((v) => [v.file, v.reason])).toEqual([["apps/mobile/tests/x.test.tsx", "apps/mobile may not import server code"]]);
    });
  });
});

describe("scanRepo: import.meta.glob", () => {
  it("is refused wherever it is called, test files included, like require.context", () => {
    const glob = 'export const all = import.meta.glob("../../*/web/index.ts", { eager: true });\n';
    withRepo({ "features/money/web/all.tsx": glob, "features/money/web/all.test.tsx": glob, "apps/web/lib/all.ts": glob }, (root) => {
      expect(scanRepo({ root }).violations).toEqual(
        ["apps/web/lib/all.ts", "features/money/web/all.test.tsx", "features/money/web/all.tsx"].map((file) => ({
          file,
          line: 1,
          specifier: "../../*/web/index.ts",
          reason: "import.meta.glob bypasses the generated registry",
        })),
      );
    });
  });
});

describe("scanRepo edge cases", () => {
  it("sorts violations by code unit, so the report reads the same on every machine", () => {
    const bad = 'import "react";\n';
    withRepo({ "features/money/core/alpha.ts": bad, "features/money/core/Zeta.ts": bad }, (root) => {
      const files = scanRepo({ root }).violations.map((v) => v.file);
      // localeCompare would put alpha.ts first.
      expect(files).toEqual(["features/money/core/Zeta.ts", "features/money/core/alpha.ts"]);
    });
  });

  it("judges a registry import by the registry file's kind, once the resolver has found the file", () => {
    const registry = {
      "features/_registry/server.ts": "export const serverParts = {};\n",
      "features/_registry/web.ts": "export const webParts = {};\n",
    };
    const reads = (up: string) =>
      `import { serverParts } from "${up}features/_registry/server";\nimport { webParts } from "${up}features/_registry/web";\nexport default [serverParts, webParts];\n`;
    withRepo({ ...registry, "apps/web/page.tsx": reads("../../"), "apps/mobile/src/index.tsx": reads("../../../") }, (root) => {
      const found = scanRepo({ root }).violations.map((v) => [v.file, v.line, v.reason]);
      expect(found).toEqual([
        ["apps/mobile/src/index.tsx", 1, "apps/mobile may not import the server registry"],
        ["apps/mobile/src/index.tsx", 2, "apps/mobile may not import the web registry"],
      ]);
    });
  });

  it("treats a hand-written reference/_registry as ordinary reference code, not as a generated registry", () => {
    const files = {
      "features/money/server/s.ts": "export const s = 1;\n",
      "reference/_registry/server.ts": 'import { s } from "../../features/money/server/s";\nexport const serverParts = { s };\n',
      "reference/_registry/core/all.ts": 'import { s } from "../../../features/money/server/s";\nexport const all = { s };\n',
      "apps/web/page.tsx": 'import { serverParts } from "../../reference/_registry/server";\nexport default serverParts;\n',
    };
    withRepo(files, (root) => {
      const found = scanRepo({ root }).violations.map((v) => [v.file, v.line, v.reason]);
      expect(found).toEqual([
        ["apps/web/page.tsx", 1, "apps/web may not import stray code"],
        ["reference/_registry/core/all.ts", 1, "reference imports only reference"],
        ["reference/_registry/server.ts", 1, "file is in no part folder (core, client, server, db, web, mobile, tests)"],
      ]);
    });
  });

  it("reads a package.json saved with a byte-order mark", () => {
    const manifest = `\uFEFF${JSON.stringify({ name: "@fx/features", private: true })}`;
    withRepo({ "features/package.json": manifest, "features/money/core/ok.ts": "export const ok = 1;\n" }, (root) => {
      expect(scanRepo({ root }).violations).toEqual([]);
    });
  });
});

describe("isCodeFile", () => {
  it.each([
    ["page.tsx", true],
    ["split.ts", true],
    ["legacy.js", true],
    ["Old.jsx", true],
    ["ingest.mjs", true],
    ["config.cjs", true],
    ["vitest.config.mts", true],
    ["next-env.d.ts", false],
    ["package.json", false],
    ["globals.css", false],
  ])("%s → %s", (name, isCode) => {
    expect(isCodeFile(name)).toBe(isCode);
  });
});

describe("packageName", () => {
  it.each([
    ["react", "react"],
    ["react-dom/client", "react-dom"],
    ["@tsa/platform/sync/core", "@tsa/platform"],
    ["@scope", null],
    ["./x", null],
    ["../x", null],
    ["/abs", null],
    ["@/lib/x", null],
    ["#internal", null],
  ])("%s → %s", (specifier, name) => {
    expect(packageName(specifier)).toBe(name);
  });
});
