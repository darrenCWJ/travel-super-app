import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packageName, scanRepo } from "./scan";

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
  "apps/web/page.tsx": 'import { Home } from "../../features/money/web/Home";\nimport "react-native";\nexport default Home;\n',
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
    expect(scannedFiles).toHaveLength(21);
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
