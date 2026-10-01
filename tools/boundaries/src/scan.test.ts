import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isCodeFile, packageName, scanRepo } from "./scan";

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

/**
 * Write `files` into a fresh temp repo, run `check` against its root, and always delete it.
 * `links` are [folder, link] pairs, each made a junction the way pnpm links a workspace package.
 */
function withRepo(files: Record<string, string>, check: (root: string) => void, links: [string, string][] = []): void {
  const root = mkdtempSync(join(tmpdir(), "boundaries-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    }
    for (const [folder, link] of links) {
      mkdirSync(dirname(join(root, link)), { recursive: true });
      symlinkSync(join(root, folder), join(root, link), "junction");
    }
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CODE = "export const x = 1;\n";

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

/** The package.json of a workspace package. */
const workspaceManifest = (name: string, extra: Record<string, unknown> = {}) => JSON.stringify({ name, private: true, ...extra });

describe("scanRepo: a specifier is judged by where it lands, not by how it looks", () => {
  const featurePackage = {
    "features/package.json": workspaceManifest("@fx/features"),
    "features/money/server/s.ts": "export const s = 1;\n",
  };

  it("follows a path alias that looks like a package to the repo file behind it", () => {
    const files = {
      ...featurePackage,
      "apps/mobile/package.json": workspaceManifest("@fx/mobile"),
      "apps/mobile/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "feat/*": ["../../features/*"], "@feat/*": ["../../features/*"] } } }),
      "apps/mobile/src/a.tsx": 'import { s } from "feat/money/server/s";\nexport default s;\n',
      "apps/mobile/src/b.tsx": 'import { s } from "@feat/money/server/s";\nexport default s;\n',
    };
    withRepo(files, (root) => {
      const { violations } = scanRepo({ root, tsconfigs: { "apps/mobile": "apps/mobile/tsconfig.json" } });
      expect(violations.map((v) => [v.file, v.specifier, v.reason])).toEqual([
        ["apps/mobile/src/a.tsx", "feat/money/server/s", "apps/mobile may not import server code"],
        ["apps/mobile/src/b.tsx", "@feat/money/server/s", "apps/mobile may not import server code"],
      ]);
    });
  });

  it("follows an alias spelled like a Node built-in to the repo file behind it", () => {
    const files = {
      ...featurePackage,
      "features/polls/core/p.ts": "export const p = 1;\n",
      "features/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { util: ["./polls/core/p.ts"], "node:fs": ["./money/server/s.ts"] } } }),
      "features/money/web/a.tsx": 'import { p } from "util";\nimport { s } from "node:fs";\nimport "node:path";\nexport default [p, s];\n',
    };
    withRepo(files, (root) => {
      const { violations } = scanRepo({ root, tsconfigs: { features: "features/tsconfig.json" } });
      expect(violations.map((v) => [v.file, v.line, v.specifier, v.reason])).toEqual([
        ["features/money/web/a.tsx", 1, "util", "features never import each other"],
        ["features/money/web/a.tsx", 2, "node:fs", "web code may not import server code"],
      ]);
    });
  });

  // A package can carry a built-in's name as well (the `events` polyfill). Node gives that spelling
  // the built-in, installed package or not, so it is still judged as the built-in.
  it("takes a built-in's name for the built-in when it lands in node_modules, or nowhere", () => {
    const files = {
      ...featurePackage,
      "node_modules/events/package.json": JSON.stringify({ name: "events", main: "index.js" }),
      "node_modules/events/index.js": "module.exports = {};\n",
      "features/money/core/x.ts": 'import "events";\nimport "node:path";\n',
    };
    withRepo(files, (root) => {
      expect(scanRepo({ root }).violations.map((v) => [v.file, v.line, v.reason])).toEqual([
        ["features/money/core/x.ts", 1, "core code may not use Node built-in events"],
        ["features/money/core/x.ts", 2, "core code may not use Node built-in node:path"],
      ]);
    });
  });

  it("judges a specifier that lands in node_modules as a package, by its name", () => {
    const files = {
      ...featurePackage,
      "node_modules/react/package.json": JSON.stringify({ name: "react", main: "index.js" }),
      "node_modules/react/index.js": "module.exports = {};\n",
      "node_modules/zod/package.json": JSON.stringify({ name: "zod", main: "index.js" }),
      "node_modules/zod/index.js": "module.exports = {};\n",
      "features/money/core/x.ts": 'import "react";\nimport "zod";\n',
    };
    withRepo(files, (root) => {
      expect(scanRepo({ root }).violations.map((v) => [v.file, v.line, v.reason])).toEqual([
        ["features/money/core/x.ts", 1, "core code may not import react"],
      ]);
    });
  });

  it("judges a specifier that resolves nowhere as a package, by its name", () => {
    withRepo({ ...featurePackage, "features/money/core/x.ts": 'import "react";\nimport "zod";\n' }, (root) => {
      expect(scanRepo({ root }).violations.map((v) => [v.file, v.line, v.reason])).toEqual([
        ["features/money/core/x.ts", 1, "core code may not import react"],
      ]);
    });
  });

  // A workspace package in a folder the scan does not list (repo.test.ts keeps that list honest) is
  // refused as a file in no zone, not waved through as an outside package.
  it("refuses a linked package whose files sit in the repo outside every zone", () => {
    const files = {
      ...featurePackage,
      "packages/db/package.json": workspaceManifest("@fx/db", { exports: { ".": "./index.ts" } }),
      "packages/db/index.ts": "export const table = 1;\n",
      "features/money/core/x.ts": 'import { table } from "@fx/db";\nexport const x = table;\n',
    };
    const check = (root: string) => {
      expect(scanRepo({ root }).violations.map((v) => [v.file, v.reason])).toEqual([
        ["features/money/core/x.ts", "imports packages/db/index.ts, which is in no zone"],
      ]);
    };
    withRepo(files, check, [["packages/db", "node_modules/@fx/db"]]);
  });

  // The repo is a folder inside the temp folder here, so that something can sit outside it.
  it("says so when a path leaves the repo, and judges a package linked from outside it by its name", () => {
    const files = {
      "outside/x.ts": CODE,
      "outside/linked/package.json": JSON.stringify({ name: "react-native-linked", main: "index.js" }),
      "outside/linked/index.js": "module.exports = {};\n",
      "repo/apps/web/page.tsx": 'import "../../../outside/x";\nimport "react-native-linked";\n',
    };
    const check = (root: string) => {
      expect(scanRepo({ root: join(root, "repo") }).violations.map((v) => [v.file, v.line, v.reason])).toEqual([
        ["apps/web/page.tsx", 1, "../../../outside/x resolves outside the repo"],
        ["apps/web/page.tsx", 2, "apps/web may not import react-native-linked"],
      ]);
    };
    withRepo(files, check, [["outside/linked", "repo/node_modules/react-native-linked"]]);
  });

  // With a tsconfig it cannot load the resolver fails every lookup, and a bare specifier that does
  // not resolve is judged by name: the aliases would be switched off without a word. Nothing here
  // imports through the broken tsconfig, so the scan has to notice it without being asked.
  it("refuses to scan with a tsconfig the resolver cannot load", () => {
    const files = {
      "apps/mobile/tsconfig.json": JSON.stringify({ extends: "not-installed/tsconfig.base" }),
      "apps/mobile/src/a.tsx": CODE,
    };
    withRepo(files, (root) => {
      const scan = () => scanRepo({ root, tsconfigs: { "apps/mobile": "apps/mobile/tsconfig.json" } });
      expect(scan).toThrow("cannot load apps/mobile/tsconfig.json: Tsconfig not found not-installed/tsconfig.base");
    });
  });
});

describe("scanRepo: a package whose own manifest requires react-native", () => {
  const NAME = "@shopify/flash-list"; // nothing in the name says it is native
  /** An installed package: its manifest (plus `fields`) and its entry file, under the repo's node_modules. */
  const installed = (fields: Record<string, unknown>, entry = "index.js") => ({
    [`node_modules/${NAME}/package.json`]: JSON.stringify({ name: NAME, main: entry, ...fields }),
    [`node_modules/${NAME}/${entry}`]: "module.exports = {};\n",
  });
  const importers = {
    "features/money/web/a.tsx": `import "${NAME}";\n`,
    "features/money/core/b.ts": `import "${NAME}";\n`,
    "features/money/client/c.ts": `import "${NAME}";\n`,
    "features/money/mobile/d.tsx": `import "${NAME}";\n`,
    "apps/mobile/src/e.tsx": `import "${NAME}";\n`,
  };
  const refused = [
    ["features/money/client/c.ts", `client code may not import ${NAME}`],
    ["features/money/core/b.ts", `core code may not import ${NAME}`],
    ["features/money/web/a.tsx", `web code may not import ${NAME}`],
  ];
  const found = (root: string) => scanRepo({ root }).violations.map((v) => [v.file, v.reason]);

  it("refuses one with a required react-native peer outside the mobile side", () => {
    withRepo({ ...installed({ peerDependencies: { "react-native": "*" } }), ...importers }, (root) => {
      expect(found(root)).toEqual(refused);
    });
  });

  it("refuses one that depends on react-native outright", () => {
    withRepo({ ...installed({ dependencies: { "react-native": "0.86.3" } }), ...importers }, (root) => {
      expect(found(root)).toEqual(refused);
    });
  });

  it("allows one whose react-native peer is optional", () => {
    const fields = { peerDependencies: { "react-native": "*" }, peerDependenciesMeta: { "react-native": { optional: true } } };
    withRepo({ ...installed(fields), ...importers }, (root) => {
      expect(found(root)).toEqual([]);
    });
  });

  it("allows one whose manifest does not mention react-native", () => {
    withRepo({ ...installed({ peerDependencies: { react: "*" } }), ...importers }, (root) => {
      expect(found(root)).toEqual([]);
    });
  });

  it("judges one that is not installed by its name alone", () => {
    withRepo(importers, (root) => {
      expect(found(root)).toEqual([]);
    });
  });

  it("reads the manifest that carries the package's name, past a nested one that does not", () => {
    const files = {
      ...installed({ peerDependencies: { "react-native": "*" } }, "dist/index.js"),
      [`node_modules/${NAME}/dist/package.json`]: JSON.stringify({ type: "commonjs" }),
      ...importers,
    };
    withRepo(files, (root) => {
      expect(found(root)).toEqual(refused);
    });
  });
});

describe("scanRepo: another package's files are reached through its name", () => {
  const packages = {
    "features/package.json": workspaceManifest("@fx/features", { exports: { "./*/web": "./*/web/index.ts", "./*/core": "./*/core/index.ts" } }),
    "platform/package.json": workspaceManifest("@fx/platform", { exports: { "./*/server": "./*/server/index.ts" } }),
    "apps/web/package.json": workspaceManifest("@fx/web"),
    "apps/mobile/package.json": workspaceManifest("@fx/mobile"),
    "platform/sync/server/index.ts": "export const api = 1;\n",
    "platform/sync/server/internal/secret.ts": "export const secret = 1;\n",
    "features/money/core/index.ts": "export const core = 1;\n",
    "features/money/web/index.ts": "export const Home = 1;\n",
    "features/money/web/parts/Private.tsx": "export const Private = () => null;\n",
  };
  const links: [string, string][] = [
    ["features", "node_modules/@fx/features"],
    ["platform", "node_modules/@fx/platform"],
  ];
  const byPath = (name: string) => `reaches into ${name} by path: import it by its package name, so its exports map applies`;
  const found = (root: string, tsconfigs?: Record<string, string>) =>
    scanRepo({ root, tsconfigs }).violations.map((v) => [v.file, v.line, v.reason]);

  it("refuses a relative path into another package, where the zone rules would allow the import", () => {
    const files = {
      ...packages,
      "features/money/server/x.ts": 'import { secret } from "../../../platform/sync/server/internal/secret";\nexport const x = secret;\n',
      "apps/web/page.tsx": 'import { Private } from "../../features/money/web/parts/Private";\nexport default Private;\n',
    };
    const check = (root: string) => {
      expect(found(root)).toEqual([
        ["apps/web/page.tsx", 1, byPath("@fx/features")],
        ["features/money/server/x.ts", 1, byPath("@fx/platform")],
      ]);
    };
    withRepo(files, check, links);
  });

  it("refuses a path alias into another package the same way", () => {
    const files = {
      ...packages,
      "apps/mobile/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@feat/*": ["../../features/*"] } } }),
      "apps/mobile/src/a.tsx": 'import { core } from "@feat/money/core/index";\nexport default core;\n',
    };
    const check = (root: string) => {
      expect(found(root, { "apps/mobile": "apps/mobile/tsconfig.json" })).toEqual([["apps/mobile/src/a.tsx", 1, byPath("@fx/features")]]);
    };
    withRepo(files, check, links);
  });

  // A monorepo often maps a package's own name to its source folder in tsconfig `paths`. The name
  // then proves nothing: only what the exports map also reaches is accepted.
  it("refuses a path alias spelled like the package's name, where it reaches past the exports map", () => {
    const files = {
      ...packages,
      "features/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@fx/platform/*": ["../platform/*"] } } }),
      "features/money/server/ok.ts": 'import { api } from "@fx/platform/sync/server";\nexport const x = api;\n',
      "features/money/server/deep.ts": 'import { secret } from "@fx/platform/sync/server/internal/secret";\nexport const x = secret;\n',
    };
    const check = (root: string) => {
      expect(found(root, { features: "features/tsconfig.json" })).toEqual([
        ["features/money/server/deep.ts", 1, "reaches into @fx/platform through a path alias, not through its exports map"],
      ]);
    };
    withRepo(files, check, links);
  });

  it("accepts the package's name, and leaves what it may reach to the package's exports map", () => {
    const files = {
      ...packages,
      "features/money/server/ok.ts": 'import { api } from "@fx/platform/sync/server";\nexport const x = api;\n',
      "features/money/server/deep.ts": 'import { secret } from "@fx/platform/sync/server/internal/secret";\nexport const x = secret;\n',
      "apps/web/page.tsx": 'import { Home } from "@fx/features/money/web";\nexport default Home;\n',
    };
    const check = (root: string) => {
      expect(found(root)).toEqual([
        ["features/money/server/deep.ts", 1, expect.stringContaining('"./sync/server/internal/secret" is not exported')],
      ]);
    };
    withRepo(files, check, links);
  });

  it("lets the zone rules speak first", () => {
    const files = { ...packages, "apps/mobile/src/a.tsx": 'import { api } from "../../../platform/sync/server/index";\nexport default api;\n' };
    const check = (root: string) => {
      expect(found(root)).toEqual([["apps/mobile/src/a.tsx", 1, "apps/mobile may not import server code"]]);
    };
    withRepo(files, check, links);
  });

  it("applies only where the file reached has a package of its own", () => {
    const files = {
      "apps/web/package.json": workspaceManifest("@fx/web"),
      "features/money/web/Home.tsx": "export const Home = () => null;\n",
      "apps/web/page.tsx": 'import { Home } from "../../features/money/web/Home";\nexport default Home;\n',
    };
    withRepo(files, (root) => {
      expect(found(root)).toEqual([]);
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
