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

  // What a developer's machine has between deleting a file and staging the deletion.
  it("leaves out a tracked file that is gone from the disk", () => {
    const repo = mkdtempSync(join(tmpdir(), "boundaries-deleted-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: repo });
      writeFileSync(join(repo, "kept.ts"), "export {};\n");
      writeFileSync(join(repo, "deleted.ts"), "export {};\n");
      execFileSync("git", ["add", "kept.ts", "deleted.ts"], { cwd: repo, stdio: "ignore" });
      rmSync(join(repo, "deleted.ts"));
      expect(trackedFiles(repo)).toEqual(["kept.ts"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
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
