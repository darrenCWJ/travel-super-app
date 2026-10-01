import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const MAX_LISTING_BYTES = 64 * 1024 * 1024;

/**
 * Every file git tracks under `root` that is still on disk, relative to `root`, with forward
 * slashes. A tracked file that was deleted and whose deletion is not staged yet is left out, as it
 * will be once the deletion is committed. Throws when git cannot answer or when nothing is left:
 * a guard that cannot see the tree has to fail, not pass on an empty list.
 */
export function trackedFiles(root: string): string[] {
  const listing = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: MAX_LISTING_BYTES });
  const files = listing.split("\0").filter((path) => path !== "" && existsSync(join(root, path)));
  if (files.length === 0) throw new Error(`git ls-files lists no file under ${root} that is still on disk`);
  return files;
}
