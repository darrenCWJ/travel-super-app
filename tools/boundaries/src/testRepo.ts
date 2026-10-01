import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// What the scan's test files share: small repos built in a temp folder, so that no deliberately
// broken code ever sits in the real tree for a type-check or a linter to trip on.

/**
 * Write `files` into a fresh temp repo, run `check` against its root, and always delete it.
 * `links` are [folder, link] pairs, each made a junction the way pnpm links a workspace package.
 */
export function withRepo(files: Record<string, string>, check: (root: string) => void, links: [string, string][] = []): void {
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

/** A code file that imports nothing. */
export const CODE = "export const x = 1;\n";

/** The package.json of a workspace package. */
export const workspaceManifest = (name: string, extra: Record<string, unknown> = {}) => JSON.stringify({ name, private: true, ...extra });
