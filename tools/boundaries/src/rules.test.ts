import { describe, expect, it } from "vitest";
import { checkEdge, type Target } from "./rules";
import type { Layer, Part, Zone } from "./zones";

const z = (layer: Layer, owner: string, part: Part | null): Zone => ({ layer, owner, part });
const to = (layer: Layer, owner: string, part: Part | null): Target => ({ kind: "zone", zone: z(layer, owner, part) });
const pkg = (name: string): Target => ({ kind: "package", name });
const builtin = (name: string): Target => ({ kind: "builtin", name });

const moneyCore = z("feature", "money", "core");
const moneyClient = z("feature", "money", "client");
const moneyServer = z("feature", "money", "server");
const moneyDb = z("feature", "money", "db");
const moneyWeb = z("feature", "money", "web");
const moneyMobile = z("feature", "money", "mobile");
const moneyManifest = z("feature", "money", "manifest");
const moneyTest = z("feature", "money", "test");
const syncCore = z("platform", "sync", "core");
const syncDb = z("platform", "sync", "db");
const countriesCore = z("reference", "countries", "core");
const web = z("app", "web", null);
const mobile = z("app", "mobile", null);

// Every rule has a case it must refuse and a neighbouring case it must allow,
// so deleting or inverting any one line of rules.ts turns at least one row red.
describe("checkEdge: ownership", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["feature → other feature", moneyCore, to("feature", "polls", "core"), false],
    ["feature → own feature", moneyClient, to("feature", "money", "core"), true],
    ["feature test → other feature", moneyTest, to("feature", "polls", "core"), false],
    ["platform → feature", syncCore, to("feature", "money", "core"), false],
    ["platform → platform", syncCore, to("platform", "identity", "core"), true],
    ["platform → reference", syncCore, to("reference", "countries", "core"), true],
    ["reference → platform", countriesCore, to("platform", "sync", "core"), false],
    ["reference → reference", countriesCore, to("reference", "cities", "core"), true],
    ["feature → app", moneyWeb, to("app", "web", null), false],
    ["app → other app", web, to("app", "mobile", null), false],
    ["app → itself", web, to("app", "web", null), true],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: parts", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["core → core", moneyCore, to("platform", "sync", "core"), true],
    ["core → client", moneyCore, to("feature", "money", "client"), false],
    ["client → client", moneyClient, to("platform", "sync", "client"), true],
    ["client → server", moneyClient, to("feature", "money", "server"), false],
    ["server → own db", moneyServer, to("feature", "money", "db"), true],
    ["server → platform db", moneyServer, to("platform", "sync", "db"), false],
    ["server → platform server", moneyServer, to("platform", "sync", "server"), true],
    ["server → web", moneyServer, to("feature", "money", "web"), false],
    ["db → platform db (FK target)", moneyDb, to("platform", "identity", "db"), true],
    ["db → server", moneyDb, to("feature", "money", "server"), false],
    ["platform db → other platform db", syncDb, to("platform", "identity", "db"), true],
    ["web → client", moneyWeb, to("feature", "money", "client"), true],
    ["web → mobile", moneyWeb, to("feature", "money", "mobile"), false],
    ["web → server", moneyWeb, to("feature", "money", "server"), false],
    ["mobile → mobile", moneyMobile, to("platform", "shell", "mobile"), true],
    ["mobile → web", moneyMobile, to("feature", "money", "web"), false],
    ["manifest → registry types", moneyManifest, to("platform", "registry", "core"), true],
    ["manifest → other core", moneyManifest, to("platform", "sync", "core"), false],
    ["core → manifest", moneyCore, to("feature", "money", "manifest"), false],
    ["core → test helper", moneyCore, to("feature", "money", "test"), false],
    ["test → test helper", moneyTest, to("feature", "money", "test"), true],
    ["test → own server", moneyTest, to("feature", "money", "server"), true],
    ["core → stray file", moneyCore, to("feature", "money", null), false],
    ["core → unzoned repo file", moneyCore, { kind: "unzoned", rel: "tools/x.ts" }, false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: registry and apps", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["web app → registry", web, to("feature", "_registry", "registry"), true],
    ["mobile app → registry", mobile, to("platform", "_registry", "registry"), true],
    ["feature → registry", moneyServer, to("feature", "_registry", "registry"), false],
    ["platform → registry", syncCore, to("feature", "_registry", "registry"), false],
    ["feature test → registry", moneyTest, to("platform", "_registry", "registry"), false],
    ["generated registry → feature part", z("feature", "_registry", "registry"), to("feature", "money", "server"), true],
    ["web app → feature web", web, to("feature", "money", "web"), true],
    ["web app → feature server", web, to("feature", "money", "server"), true],
    ["web app → feature mobile", web, to("feature", "money", "mobile"), false],
    ["web app → feature db", web, to("feature", "money", "db"), false],
    ["mobile app → feature mobile", mobile, to("feature", "money", "mobile"), true],
    ["mobile app → feature server", mobile, to("feature", "money", "server"), false],
    ["mobile app → feature web", mobile, to("feature", "money", "web"), false],
    ["app → manifest", web, to("feature", "money", "manifest"), false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: packages", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["core → zod", moneyCore, pkg("zod"), true],
    ["core → react", moneyCore, pkg("react"), false],
    ["core → drizzle-orm", moneyCore, pkg("drizzle-orm"), false],
    ["core → next", moneyCore, pkg("next"), false],
    ["core → node:fs", moneyCore, builtin("node:fs"), false],
    ["client → react", moneyClient, pkg("react"), true],
    ["client → node:fs", moneyClient, builtin("node:fs"), false],
    ["client → react-dom", moneyClient, pkg("react-dom"), false],
    ["client → react-native", moneyClient, pkg("react-native"), false],
    ["client → expo-sqlite", moneyClient, pkg("expo-sqlite"), false],
    ["client → @react-native-community/netinfo", moneyClient, pkg("@react-native-community/netinfo"), false],
    ["core → @react-native/assets-registry", moneyCore, pkg("@react-native/assets-registry"), false],
    ["core → @next/env", moneyCore, pkg("@next/env"), false],
    ["core → expo", moneyCore, pkg("expo"), false],
    ["server → drizzle-orm", moneyServer, pkg("drizzle-orm"), true],
    ["server → node:crypto", moneyServer, builtin("node:crypto"), true],
    ["server → react", moneyServer, pkg("react"), false],
    ["db → drizzle-orm", moneyDb, pkg("drizzle-orm"), true],
    ["db → next", moneyDb, pkg("next"), false],
    ["web → next", moneyWeb, pkg("next"), true],
    ["web → react-dom", moneyWeb, pkg("react-dom"), true],
    ["web → @expo/vector-icons", moneyWeb, pkg("@expo/vector-icons"), false],
    ["web → drizzle-orm", moneyWeb, pkg("drizzle-orm"), false],
    ["web → react-native-reanimated", moneyWeb, pkg("react-native-reanimated"), false],
    ["mobile → expo-router", moneyMobile, pkg("expo-router"), true],
    ["mobile → react-native-svg", moneyMobile, pkg("react-native-svg"), true],
    ["mobile → react-dom", moneyMobile, pkg("react-dom"), false],
    ["mobile → next", moneyMobile, pkg("next"), false],
    ["mobile → node:path", moneyMobile, builtin("node:path"), false],
    ["manifest → any package", moneyManifest, pkg("zod"), false],
    ["test → anything", moneyTest, pkg("react-dom"), true],
    ["web app → d3-geo", web, pkg("d3-geo"), true],
    ["web app → react-native", web, pkg("react-native"), false],
    ["mobile app → expo", mobile, pkg("expo"), true],
    ["mobile app → next", mobile, pkg("next"), false],
    ["web app → node:fs", web, builtin("node:fs"), true],
    ["mobile app → node:fs", mobile, builtin("node:fs"), false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});
