import { describe, expect, it } from "vitest";
import { classify } from "./zones";

describe("classify", () => {
  it.each([
    ["features/money/core/split.ts", { layer: "feature", owner: "money", part: "core" }],
    ["features/money/client/useLedger.ts", { layer: "feature", owner: "money", part: "client" }],
    ["features/money/server/commands.ts", { layer: "feature", owner: "money", part: "server" }],
    ["features/money/db/schema.ts", { layer: "feature", owner: "money", part: "db" }],
    ["features/money/web/Home.tsx", { layer: "feature", owner: "money", part: "web" }],
    ["features/money/mobile/Home.tsx", { layer: "feature", owner: "money", part: "mobile" }],
    ["features/money/manifest.ts", { layer: "feature", owner: "money", part: "manifest" }],
    ["features/money/tests/fixtures.ts", { layer: "feature", owner: "money", part: "test" }],
    ["features/money/e2e/steps.ts", { layer: "feature", owner: "money", part: "test" }],
    ["features/money/core/split.test.ts", { layer: "feature", owner: "money", part: "test" }],
    ["features/_registry/manifests.ts", { layer: "feature", owner: "_registry", part: "registry", kind: "manifests" }],
    ["features/_registry/client.ts", { layer: "feature", owner: "_registry", part: "registry", kind: "client" }],
    ["features/_registry/server.ts", { layer: "feature", owner: "_registry", part: "registry", kind: "server" }],
    ["features/_registry/web.ts", { layer: "feature", owner: "_registry", part: "registry", kind: "web" }],
    ["features/_registry/mobile.ts", { layer: "feature", owner: "_registry", part: "registry", kind: "mobile" }],
    ["platform/sync/core/protocol.ts", { layer: "platform", owner: "sync", part: "core" }],
    ["platform/_registry/server.ts", { layer: "platform", owner: "_registry", part: "registry", kind: "server" }],
    ["reference/countries/core/facts.ts", { layer: "reference", owner: "countries", part: "core" }],
    ["apps/web/lib/itinerary.ts", { layer: "app", owner: "web", part: null }],
    ["apps/mobile/src/app/index.tsx", { layer: "app", owner: "mobile", part: null }],
  ])("%s", (rel, zone) => {
    expect(classify(rel)).toEqual(zone);
  });

  it("gives a layered file outside a part folder no part, so the scan can report it", () => {
    expect(classify("features/money/utils.ts")).toEqual({ layer: "feature", owner: "money", part: null });
    expect(classify("platform/sync/helpers/x.ts")).toEqual({ layer: "platform", owner: "sync", part: null });
  });

  // Only features/_registry and platform/_registry are written by the generator (spec §0 "Registry").
  it.each([
    ["reference/_registry/server.ts", { layer: "reference", owner: "_registry", part: null }],
    ["reference/_registry/core/facts.ts", { layer: "reference", owner: "_registry", part: "core" }],
  ])("gives %s no registry part: a folder of that name under reference/ is an ordinary module", (rel, zone) => {
    expect(classify(rel)).toEqual(zone);
  });

  it("treats manifest.ts as the manifest only at a feature's root", () => {
    expect(classify("features/money/core/manifest.ts")?.part).toBe("core");
    expect(classify("platform/sync/manifest.ts")?.part).toBe(null);
  });

  it.each(["package.json", "docs/x.md", "tools/boundaries/src/scan.ts", "features/package.json", "platform/vitest.config.ts"])(
    "leaves %s ungoverned",
    (rel) => {
      expect(classify(rel)).toBeNull();
    },
  );
});
