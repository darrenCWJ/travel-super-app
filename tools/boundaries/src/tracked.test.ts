import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { trackedFiles } from "./tracked";

describe("trackedFiles", () => {
  it("lists what git tracks, relative to the folder it is given, with forward slashes", () => {
    const files = trackedFiles(fileURLToPath(new URL("../../..", import.meta.url)));
    expect(files).toContain("package.json");
    expect(files).toContain("tools/boundaries/package.json");
    expect(files.filter((path) => path.includes("\\"))).toEqual([]);
  });

  it("throws where git tracks nothing, so that a guard built on the list cannot pass on an empty one", () => {
    const empty = mkdtempSync(join(tmpdir(), "boundaries-untracked-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: empty });
      writeFileSync(join(empty, "untracked.ts"), "export {};\n");
      expect(() => trackedFiles(empty)).toThrow("git ls-files lists no file under");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
