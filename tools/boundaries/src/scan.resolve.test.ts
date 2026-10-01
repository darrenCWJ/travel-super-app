import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo } from "./scan";
import { CODE, withRepo, workspaceManifest } from "./testRepo";

// How scanRepo judges a specifier once the resolver has answered. Each describe builds its own small repos.
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

  // repo.test.ts turns this on for the real tree, where every package is installed. Without it an
  // alias whose target the resolver cannot find (here a file that exists only as only.native.ts)
  // is taken for a package that is not installed.
  it("refuses a value import that resolves nowhere when told to, and still judges a type-only one by its name", () => {
    const files = {
      ...featurePackage,
      "features/money/server/only.native.ts": "export const s = 1;\n",
      "apps/mobile/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "feat/*": ["../../features/*"] } } }),
      "apps/mobile/src/a.tsx": 'import { s } from "feat/money/server/only";\nimport type { T } from "types-only";\nimport type { D } from "react-dom";\nexport default s;\n',
    };
    withRepo(files, (root) => {
      const found = (refuseUnresolved?: boolean) =>
        scanRepo({ root, tsconfigs: { "apps/mobile": "apps/mobile/tsconfig.json" }, refuseUnresolved }).violations.map((v) => [v.file, v.line, v.reason]);
      const byName = ["apps/mobile/src/a.tsx", 3, "apps/mobile may not import react-dom"];
      expect(found(true)).toEqual([["apps/mobile/src/a.tsx", 1, "cannot resolve feat/money/server/only: Cannot find module 'feat/money/server/only'"], byName]);
      expect(found()).toEqual([byName]);
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

  it("reads the first manifest above the file that has a name, past a nested one that has none", () => {
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

// The spelling of a specifier is not the package: an npm alias or a tsconfig alias gives any
// package any name. What is installed says what it is, in its own manifest.
describe("scanRepo: an installed package is judged by the name in its own manifest", () => {
  /** A package installed in node_modules/<folder>: its manifest (`fields`) and its entry file. */
  const installedAs = (folder: string, fields: Record<string, unknown>) => ({
    [`node_modules/${folder}/package.json`]: JSON.stringify({ main: "index.js", ...fields }),
    [`node_modules/${folder}/index.js`]: "module.exports = {};\n",
  });
  const found = (root: string, tsconfigs?: Record<string, string>) =>
    scanRepo({ root, tsconfigs }).violations.map((v) => [v.file, v.specifier, v.reason]);

  it("reads through an npm alias: the name rules, the react-native-web refusal and the manifest rule", () => {
    const files = {
      ...installedAs("rn", { name: "react-native" }),
      ...installedAs("rnw", { name: "react-native-web" }),
      ...installedAs("list", { name: "@shopify/flash-list", peerDependencies: { "react-native": "*" } }),
      "features/money/web/a.tsx": 'import "rn";\nimport "rnw";\nimport "list";\n',
      "features/money/core/b.ts": 'import "rn";\n',
      "apps/mobile/src/c.tsx": 'import "rn";\nimport "rnw";\nimport "list";\n',
    };
    withRepo(files, (root) => {
      expect(found(root)).toEqual([
        ["apps/mobile/src/c.tsx", "rnw", "nothing uses react-native-web (spec §0)"],
        ["features/money/core/b.ts", "rn", "core code may not import react-native"],
        ["features/money/web/a.tsx", "rn", "web code may not import react-native"],
        ["features/money/web/a.tsx", "rnw", "nothing uses react-native-web (spec §0)"],
        ["features/money/web/a.tsx", "list", "web code may not import @shopify/flash-list"],
      ]);
    });
  });

  it("reads through a tsconfig alias that points into node_modules", () => {
    const files = {
      ...installedAs("react-native", { name: "react-native" }),
      "features/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { ui: ["../node_modules/react-native"], "ui/*": ["../node_modules/react-native/*"] } } }),
      "features/money/web/a.tsx": 'import "ui";\n',
      "features/money/core/b.ts": 'import "ui/index.js";\n',
      "features/money/mobile/c.tsx": 'import "ui";\n',
    };
    withRepo(files, (root) => {
      expect(found(root, { features: "features/tsconfig.json" })).toEqual([
        ["features/money/core/b.ts", "ui/index.js", "core code may not import react-native"],
        ["features/money/web/a.tsx", "ui", "web code may not import react-native"],
      ]);
    });
  });

  it("takes the first manifest above the file that has a name, and the spelling when none has", () => {
    const files = {
      // A nested manifest with a name of its own: that is the package the file belongs to.
      ...installedAs("pkg", { name: "pkg" }),
      ...installedAs("pkg/native", { name: "react-native" }),
      // No manifest, and a manifest without a name: nothing says otherwise, so the spelling stands.
      "node_modules/react-native/index.js": "module.exports = {};\n",
      ...installedAs("react-dom", {}),
      "features/money/core/a.ts": 'import "pkg";\nimport "pkg/native";\nimport "react-native";\nimport "react-dom";\n',
    };
    withRepo(files, (root) => {
      expect(found(root)).toEqual([
        ["features/money/core/a.ts", "pkg/native", "core code may not import react-native"],
        ["features/money/core/a.ts", "react-native", "core code may not import react-native"],
        ["features/money/core/a.ts", "react-dom", "core code may not import react-dom"],
      ]);
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

  // pnpm's injected dependencies copy a workspace package into an app's node_modules. To the
  // resolver the copy is an installed package, and its files are in no zone.
  it("refuses a workspace package that resolves to a copy of it under node_modules", () => {
    const copy = (folder: string, manifest?: string) => ({
      ...(manifest === undefined ? {} : { [`apps/mobile/node_modules/${folder}/package.json`]: manifest }),
      [`apps/mobile/node_modules/${folder}/sync/server/index.ts`]: "export const api = 1;\n",
    });
    const files = {
      ...packages,
      ...copy("@fx/platform", workspaceManifest("@fx/platform", { exports: { "./*/server": "./*/server/index.ts" } })),
      "apps/mobile/src/a.tsx": 'import { api } from "@fx/platform/sync/server";\nexport default api;\n',
      // Under another folder name, the copy's own manifest still says which package it is.
      ...copy("plat", workspaceManifest("@fx/platform")),
      "apps/mobile/src/b.tsx": 'import { api } from "plat/sync/server/index";\nexport default api;\n',
      // With no manifest at all, the specifier's own name does.
      ...copy("@fx/features"),
      "apps/mobile/src/c.tsx": 'import { api } from "@fx/features/sync/server/index";\nexport default api;\n',
    };
    const refused = (file: string, specifier: string, owner: string, folder: string) => [
      `apps/mobile/src/${file}`,
      1,
      `${specifier} resolves to a copy of the workspace package ${owner}, not to its own files: apps/mobile/node_modules/${folder}/sync/server/index.ts`,
    ];
    const check = (root: string) => {
      expect(found(root)).toEqual([
        refused("a.tsx", "@fx/platform/sync/server", "@fx/platform", "@fx/platform"),
        refused("b.tsx", "plat/sync/server/index", "@fx/platform", "plat"),
        refused("c.tsx", "@fx/features/sync/server/index", "@fx/features", "@fx/features"),
      ]);
    };
    withRepo(files, check, links);
  });

  // The repo is a folder inside the temp folder here, so that the name can lead out of it.
  it("refuses a workspace package's name that leads outside the repo, in the same words", () => {
    const files = {
      "repo/features/package.json": workspaceManifest("@fx/features"),
      "repo/features/money/core/index.ts": CODE,
      "elsewhere/features/money/core/index.ts": CODE,
      "repo/apps/web/page.tsx": 'import "@fx/features/money/core/index";\n',
    };
    const check = (root: string) => {
      expect(found(join(root, "repo"))).toEqual([
        [
          "apps/web/page.tsx",
          1,
          "@fx/features/money/core/index resolves to a copy of the workspace package @fx/features, not to its own files: ../elsewhere/features/money/core/index.ts",
        ],
      ]);
    };
    withRepo(files, check, [["elsewhere/features", "repo/node_modules/@fx/features"]]);
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
