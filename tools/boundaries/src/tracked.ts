import { execFileSync } from "node:child_process";

const MAX_LISTING_BYTES = 64 * 1024 * 1024;

/**
 * Every file git tracks under `root`, relative to it, with forward slashes. Throws when git cannot
 * answer or lists nothing: a guard that cannot see the tree has to fail, not pass on an empty list.
 */
export function trackedFiles(root: string): string[] {
  const listing = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: MAX_LISTING_BYTES });
  const files = listing.split("\0").filter((path) => path !== "");
  if (files.length === 0) throw new Error(`git ls-files lists no file under ${root}`);
  return files;
}
