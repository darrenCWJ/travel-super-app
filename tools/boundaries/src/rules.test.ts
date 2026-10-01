import { describe, expect, it } from "vitest";
import { checkEdge, type Target } from "./rules";
import type { Layer, Part, Zone } from "./zones";

const z = (layer: Layer, owner: string, part: Part | null, kind?: string): Zone =>
  kind === undefined ? { layer, owner, part } : { layer, owner, part, kind };
const to = (layer: Layer, owner: string, part: Part | null, kind?: string): Target => ({ kind: "zone", zone: z(layer, owner, part, kind) });
/** A generated registry file: `kind` is its base name ("server" for features/_registry/server.ts). */
const registry = (layer: "feature" | "platform", kind: string): Target => to(layer, "_registry", "registry", kind);
const pkg = (name: string): Target => ({ kind: "package", name });
/** An installed package whose own manifest requires react-native (the scan reads it; see scan.ts). */
const nativePkg = (name: string): Target => ({ kind: "package", name, native: true });
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

// Every rule has a case it must refuse and a neighbouring case it must allow. Beyond that, each cell of
// the part and registry tables, each banned-package test and each built-ins flag has a row of its own,
// so deleting or inverting a rule line, dropping a part or registry kind from a table or adding one,
// dropping a banned-package test or flipping a built-ins flag turns at least one row red. The wording of
// a refusal is pinned last. Not pinned: a new ban on a package the spec leaves open (next in server
// code, drizzle-orm in apps/web).
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
    ["core → server", moneyCore, to("feature", "money", "server"), false],
    ["core → db", moneyCore, to("feature", "money", "db"), false],
    ["core → web", moneyCore, to("feature", "money", "web"), false],
    ["core → mobile", moneyCore, to("feature", "money", "mobile"), false],
    ["client → core", moneyClient, to("platform", "sync", "core"), true],
    ["client → client", moneyClient, to("platform", "sync", "client"), true],
    ["client → server", moneyClient, to("feature", "money", "server"), false],
    ["client → db", moneyClient, to("feature", "money", "db"), false],
    ["client → web", moneyClient, to("feature", "money", "web"), false],
    ["client → mobile", moneyClient, to("feature", "money", "mobile"), false],
    ["server → core", moneyServer, to("platform", "sync", "core"), true],
    ["server → client", moneyServer, to("feature", "money", "client"), false],
    ["server → own db", moneyServer, to("feature", "money", "db"), true],
    ["server → platform db", moneyServer, to("platform", "sync", "db"), false],
    ["server → same-named platform db", z("feature", "sync", "server"), to("platform", "sync", "db"), false],
    ["server → platform server", moneyServer, to("platform", "sync", "server"), true],
    ["server → web", moneyServer, to("feature", "money", "web"), false],
    ["server → mobile", moneyServer, to("feature", "money", "mobile"), false],
    ["db → core", moneyDb, to("platform", "sync", "core"), true],
    ["db → client", moneyDb, to("feature", "money", "client"), false],
    ["db → platform db (FK target)", moneyDb, to("platform", "identity", "db"), true],
    ["db → reference db", moneyDb, to("reference", "countries", "db"), false],
    ["db → server", moneyDb, to("feature", "money", "server"), false],
    ["db → web", moneyDb, to("feature", "money", "web"), false],
    ["db → mobile", moneyDb, to("feature", "money", "mobile"), false],
    ["platform db → other platform db", syncDb, to("platform", "identity", "db"), true],
    ["web → core", moneyWeb, to("platform", "sync", "core"), true],
    ["web → client", moneyWeb, to("feature", "money", "client"), true],
    ["web → platform web", moneyWeb, to("platform", "shell", "web"), true],
    ["web → mobile", moneyWeb, to("feature", "money", "mobile"), false],
    ["web → server", moneyWeb, to("feature", "money", "server"), false],
    ["web → db", moneyWeb, to("feature", "money", "db"), false],
    ["mobile → core", moneyMobile, to("platform", "sync", "core"), true],
    ["mobile → client", moneyMobile, to("platform", "sync", "client"), true],
    ["mobile → mobile", moneyMobile, to("platform", "shell", "mobile"), true],
    ["mobile → web", moneyMobile, to("feature", "money", "web"), false],
    ["mobile → server", moneyMobile, to("feature", "money", "server"), false],
    ["mobile → db", moneyMobile, to("feature", "money", "db"), false],
    ["manifest → registry types", moneyManifest, to("platform", "registry", "core"), true],
    ["manifest → other core", moneyManifest, to("platform", "sync", "core"), false],
    ["manifest → registry client", moneyManifest, to("platform", "registry", "client"), false],
    ["manifest → reference registry", moneyManifest, to("reference", "registry", "core"), false],
    ["core → manifest", moneyCore, to("feature", "money", "manifest"), false],
    ["client → manifest", moneyClient, to("feature", "money", "manifest"), false],
    ["server → manifest", moneyServer, to("feature", "money", "manifest"), false],
    ["db → manifest", moneyDb, to("feature", "money", "manifest"), false],
    ["web → manifest", moneyWeb, to("feature", "money", "manifest"), false],
    ["mobile → manifest", moneyMobile, to("feature", "money", "manifest"), false],
    ["core → test helper", moneyCore, to("feature", "money", "test"), false],
    ["client → test helper", moneyClient, to("feature", "money", "test"), false],
    ["server → test helper", moneyServer, to("feature", "money", "test"), false],
    ["db → test helper", moneyDb, to("feature", "money", "test"), false],
    ["web → test helper", moneyWeb, to("feature", "money", "test"), false],
    ["mobile → test helper", moneyMobile, to("feature", "money", "test"), false],
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
    ["web app → manifests registry", web, registry("feature", "manifests"), true],
    ["web app → client registry", web, registry("feature", "client"), true],
    ["web app → features server registry", web, registry("feature", "server"), true],
    ["web app → platform server registry", web, registry("platform", "server"), true],
    ["web app → web registry", web, registry("feature", "web"), true],
    ["web app → mobile registry", web, registry("feature", "mobile"), false],
    ["web app → registry of no known kind", web, to("feature", "_registry", "registry"), false],
    ["mobile app → manifests registry", mobile, registry("feature", "manifests"), true],
    ["mobile app → client registry", mobile, registry("feature", "client"), true],
    ["mobile app → features server registry", mobile, registry("feature", "server"), false],
    ["mobile app → platform server registry", mobile, registry("platform", "server"), false],
    ["mobile app → web registry", mobile, registry("feature", "web"), false],
    ["mobile app → mobile registry", mobile, registry("feature", "mobile"), true],
    ["feature → registry", moneyServer, registry("feature", "web"), false],
    ["feature named like an app → registry", z("feature", "web", "server"), registry("feature", "client"), false],
    ["platform → registry", syncCore, registry("feature", "server"), false],
    ["feature test → registry", moneyTest, registry("platform", "server"), false],
    ["generated registry → feature part", z("feature", "_registry", "registry", "server"), to("feature", "money", "server"), true],
    ["web app → feature core", web, to("feature", "money", "core"), true],
    ["web app → feature client", web, to("feature", "money", "client"), true],
    ["web app → feature web", web, to("feature", "money", "web"), true],
    ["web app → feature server", web, to("feature", "money", "server"), true],
    ["web app → feature mobile", web, to("feature", "money", "mobile"), false],
    ["web app → feature db", web, to("feature", "money", "db"), false],
    ["web app → feature test helper", web, to("feature", "money", "test"), false],
    ["mobile app → feature core", mobile, to("feature", "money", "core"), true],
    ["mobile app → feature client", mobile, to("feature", "money", "client"), true],
    ["mobile app → feature mobile", mobile, to("feature", "money", "mobile"), true],
    ["mobile app → feature server", mobile, to("feature", "money", "server"), false],
    ["mobile app → feature web", mobile, to("feature", "money", "web"), false],
    ["mobile app → feature db", mobile, to("feature", "money", "db"), false],
    ["mobile app → feature test helper", mobile, to("feature", "money", "test"), false],
    ["app → manifest", web, to("feature", "money", "manifest"), false],
    ["mobile app → manifest", mobile, to("feature", "money", "manifest"), false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: packages", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["core → zod", moneyCore, pkg("zod"), true],
    ["core → react", moneyCore, pkg("react"), false],
    ["core → react-dom", moneyCore, pkg("react-dom"), false],
    ["core → drizzle-orm", moneyCore, pkg("drizzle-orm"), false],
    ["core → next", moneyCore, pkg("next"), false],
    ["core → node:fs", moneyCore, builtin("node:fs"), false],
    ["client → react", moneyClient, pkg("react"), true],
    ["client → node:fs", moneyClient, builtin("node:fs"), false],
    ["client → react-dom", moneyClient, pkg("react-dom"), false],
    ["client → react-native", moneyClient, pkg("react-native"), false],
    ["client → next", moneyClient, pkg("next"), false],
    ["client → drizzle-orm", moneyClient, pkg("drizzle-orm"), false],
    ["client → expo-sqlite", moneyClient, pkg("expo-sqlite"), false],
    ["client → @react-native-community/netinfo", moneyClient, pkg("@react-native-community/netinfo"), false],
    ["core → @react-native/assets-registry", moneyCore, pkg("@react-native/assets-registry"), false],
    ["core → @next/env", moneyCore, pkg("@next/env"), false],
    ["core → expo", moneyCore, pkg("expo"), false],
    ["server → drizzle-orm", moneyServer, pkg("drizzle-orm"), true],
    ["server → node:crypto", moneyServer, builtin("node:crypto"), true],
    ["server → react", moneyServer, pkg("react"), false],
    ["server → react-dom", moneyServer, pkg("react-dom"), false],
    ["server → react-native", moneyServer, pkg("react-native"), false],
    ["server → expo", moneyServer, pkg("expo"), false],
    ["db → drizzle-orm", moneyDb, pkg("drizzle-orm"), true],
    ["db → node:crypto", moneyDb, builtin("node:crypto"), true],
    ["db → react", moneyDb, pkg("react"), false],
    ["db → react-dom", moneyDb, pkg("react-dom"), false],
    ["db → react-native", moneyDb, pkg("react-native"), false],
    ["db → expo", moneyDb, pkg("expo"), false],
    ["db → next", moneyDb, pkg("next"), false],
    ["web → next", moneyWeb, pkg("next"), true],
    ["web → react", moneyWeb, pkg("react"), true],
    ["web → react-dom", moneyWeb, pkg("react-dom"), true],
    ["web → node:path", moneyWeb, builtin("node:path"), true],
    ["web → @expo/vector-icons", moneyWeb, pkg("@expo/vector-icons"), false],
    ["web → drizzle-orm", moneyWeb, pkg("drizzle-orm"), false],
    ["web → react-native-reanimated", moneyWeb, pkg("react-native-reanimated"), false],
    ["mobile → expo-router", moneyMobile, pkg("expo-router"), true],
    ["mobile → react", moneyMobile, pkg("react"), true],
    ["mobile → react-native-svg", moneyMobile, pkg("react-native-svg"), true],
    ["mobile → react-dom", moneyMobile, pkg("react-dom"), false],
    ["mobile → next", moneyMobile, pkg("next"), false],
    ["mobile → drizzle-orm", moneyMobile, pkg("drizzle-orm"), false],
    ["mobile → node:path", moneyMobile, builtin("node:path"), false],
    ["manifest → any package", moneyManifest, pkg("zod"), false],
    ["test → anything", moneyTest, pkg("react-dom"), true],
    ["web app → d3-geo", web, pkg("d3-geo"), true],
    ["web app → react", web, pkg("react"), true],
    ["web app → react-dom", web, pkg("react-dom"), true],
    ["web app → next", web, pkg("next"), true],
    ["web app → react-native", web, pkg("react-native"), false],
    ["web app → expo", web, pkg("expo"), false],
    ["web app → node:fs", web, builtin("node:fs"), true],
    ["mobile app → react", mobile, pkg("react"), true],
    ["mobile app → react-native", mobile, pkg("react-native"), true],
    ["mobile app → expo", mobile, pkg("expo"), true],
    ["mobile app → react-dom", mobile, pkg("react-dom"), false],
    ["mobile app → next", mobile, pkg("next"), false],
    ["mobile app → drizzle-orm", mobile, pkg("drizzle-orm"), false],
    ["mobile app → node:fs", mobile, builtin("node:fs"), false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

// The two native families by name, one row per shape a name can take. The unscoped shapes
// (react-native, react-native-*, @react-native/*, @react-native-*/*, expo, expo-*, @expo/*) have their
// rows in the table above.
describe("checkEdge: native packages by name", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["web → @testing-library/react-native (the scoped name is react-native)", moneyWeb, pkg("@testing-library/react-native"), false],
    ["web → @shopify/react-native-skia (the scoped name starts react-native-)", moneyWeb, pkg("@shopify/react-native-skia"), false],
    ["web → @maplibre/maplibre-react-native (the scoped name ends -react-native)", moneyWeb, pkg("@maplibre/maplibre-react-native"), false],
    ["web → @react-navigation/native", moneyWeb, pkg("@react-navigation/native"), false],
    ["web → lottie-react-native (unscoped: the name does not tell)", moneyWeb, pkg("lottie-react-native"), true],
    ["web → @testing-library/react", moneyWeb, pkg("@testing-library/react"), true],
    ["mobile → @maplibre/maplibre-react-native", moneyMobile, pkg("@maplibre/maplibre-react-native"), true],
    ["mobile app → @react-navigation/native", mobile, pkg("@react-navigation/native"), true],
    ["web → @better-auth/expo (the scoped name is expo)", moneyWeb, pkg("@better-auth/expo"), false],
    ["web → @acme/expo-camera (the scoped name starts expo-)", moneyWeb, pkg("@acme/expo-camera"), false],
    ["web → exponential-backoff", moneyWeb, pkg("exponential-backoff"), true],
    ["mobile → @better-auth/expo", moneyMobile, pkg("@better-auth/expo"), true],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

// A package whose manifest requires react-native is judged like the React Native family, whatever
// it is called: refused wherever that family is, allowed wherever it is.
describe("checkEdge: native packages by manifest", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["core → native package", moneyCore, nativePkg("@shopify/flash-list"), false],
    ["client → native package", moneyClient, nativePkg("@shopify/flash-list"), false],
    ["server → native package", moneyServer, nativePkg("@shopify/flash-list"), false],
    ["db → native package", moneyDb, nativePkg("@shopify/flash-list"), false],
    ["web → native package", moneyWeb, nativePkg("@shopify/flash-list"), false],
    ["web app → native package", web, nativePkg("@shopify/flash-list"), false],
    ["mobile → native package", moneyMobile, nativePkg("@shopify/flash-list"), true],
    ["mobile app → native package", mobile, nativePkg("@shopify/flash-list"), true],
    ["test → native package", moneyTest, nativePkg("@shopify/flash-list"), true],
    ["web → the same name, manifest not native", moneyWeb, pkg("@shopify/flash-list"), true],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

// The two apps share logic and never screens (spec §0), so this one package is refused everywhere,
// in the places that are otherwise unrestricted too.
describe("checkEdge: react-native-web", () => {
  it.each<[string, Zone]>([
    ["core", moneyCore],
    ["client", moneyClient],
    ["server", moneyServer],
    ["db", moneyDb],
    ["web", moneyWeb],
    ["mobile", moneyMobile],
    ["a manifest", moneyManifest],
    ["a test", moneyTest],
    ["a generated registry", z("feature", "_registry", "registry", "mobile")],
    ["a file in no part folder", z("feature", "money", null)],
    ["the web app", web],
    ["the mobile app", mobile],
  ])("is refused from %s", (_name, from) => {
    expect(checkEdge(from, pkg("react-native-web"))).toBe("nothing uses react-native-web (spec §0)");
  });

  it("is the package of exactly that name, not its neighbours", () => {
    expect(checkEdge(moneyMobile, pkg("react-native-webview"))).toBeNull();
    expect(checkEdge(moneyTest, pkg("babel-plugin-react-native-web"))).toBeNull();
  });
});

describe("checkEdge: what a refusal says", () => {
  it.each<[string, Zone, Target, string]>([
    ["an app reading the wrong registry", web, registry("feature", "mobile"), "apps/web may not import the mobile registry"],
    ["the phone reading a server registry", mobile, registry("platform", "server"), "apps/mobile may not import the server registry"],
    ["a feature reading any registry", moneyServer, registry("feature", "web"), "only the apps import the generated registry"],
    ["an app importing a banned package", web, pkg("react-native"), "apps/web may not import react-native"],
    ["an app using a banned built-in", mobile, builtin("node:fs"), "apps/mobile may not use Node built-in node:fs"],
    ["a part importing a banned package", moneyCore, pkg("react"), "core code may not import react"],
    ["a part importing a package whose manifest requires react-native", moneyWeb, nativePkg("@shopify/flash-list"), "web code may not import @shopify/flash-list"],
    ["a part importing a part it may not", moneyClient, to("feature", "money", "server"), "client code may not import server code"],
  ])("%s", (_name, from, target, reason) => {
    expect(checkEdge(from, target)).toBe(reason);
  });
});
