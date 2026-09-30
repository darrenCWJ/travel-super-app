import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRepo } from "./scan";

const root = fileURLToPath(new URL("../../..", import.meta.url));

// Path aliases per app. apps/web's "@/*" resolves through its own tsconfig.
const TSCONFIGS = { "apps/web": "apps/web/tsconfig.json" };

describe("this repo's imports", () => {
  const { violations, scannedFiles } = scanRepo({ root, tsconfigs: TSCONFIGS });

  // A clean result only means something if the scan reached the code: check
  // for files it must see, and a floor well under today's count.
  it("reach the whole web app", () => {
    expect(scannedFiles).toContain("apps/web/proxy.ts");
    expect(scannedFiles).toContain("apps/web/app/layout.tsx");
    expect(scannedFiles).toContain("apps/web/lib/server/store.ts");
    expect(scannedFiles.length).toBeGreaterThan(300);
  });

  it("cross no zone boundary", () => {
    expect(violations).toEqual([]);
  });
});
