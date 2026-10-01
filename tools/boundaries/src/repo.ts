import { isCodeFile, SCAN_ROOTS } from "./scan";
import { classify } from "./zones";

/**
 * Checks on the repo's own files that the import scan takes for granted, as pure functions so that
 * each can be shown a broken input without a real file being edited. repo.test.ts runs them on
 * this repo.
 */

/**
 * The tracked code files the boundary rules govern that the scan did not read. A file is governed
 * when it sits under a scan root, or when `classify` puts it in a zone: that second half names the
 * code beside the scan roots (apps/mobile/lib/…) and the code of an app the scan has no root for.
 */
export function unscannedCodeFiles(tracked: string[], scannedFiles: string[]): string[] {
  const scanned = new Set(scannedFiles);
  const governed = (rel: string) => SCAN_ROOTS.some((scanRoot) => rel.startsWith(`${scanRoot}/`)) || classify(rel) !== null;
  return tracked.filter((rel) => isCodeFile(rel) && governed(rel) && !scanned.has(rel));
}
