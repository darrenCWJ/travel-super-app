import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lockedVersions, lockfileProblems, readBundledNativeModules } from "./lockfile";

const root = fileURLToPath(new URL("../../..", import.meta.url));

/** A pnpm lockfile holding these packages, each written as `name@version`. */
function lockfile(...packages: string[]): string {
  const entries = packages.map((key) => `  '${key}':\n    resolution: {integrity: sha512-x}\n`).join("\n");
  const snapshots = packages.map((key) => `  '${key}': {}\n`).join("\n");
  return `lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\npackages:\n\n${entries}\nsnapshots:\n\n${snapshots}`;
}

// What Expo SDK 57 expects of the packages these tests lock (from its bundledNativeModules.json).
const SDK = {
  react: "19.2.3",
  "react-dom": "19.2.3",
  "react-native": "0.86.3",
  "react-native-reanimated": "4.5.1",
  "react-native-gesture-handler": "~2.32.0",
  "@expo/metro-runtime": "~57.0.16",
  "react-native-web": "~0.21.0",
  "expo-camera": "~57.0.9",
};
const ONE_REACT = ["react@19.2.3", "react-dom@19.2.3", "react-native@0.86.3"];

describe("this repo's lockfile", () => {
  const text = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");

  it("holds one React, no react-native-web, and the native versions this Expo SDK expects", () => {
    expect(lockfileProblems(text, readBundledNativeModules(root))).toEqual([]);
  });

  // A clean result only means something if the SDK's list and the lockfile overlap: a floor well
  // under today's 26 packages, and one name that has to be among them.
  it("is compared with a list that names packages it holds", () => {
    const locked = lockedVersions(text);
    const compared = Object.keys(readBundledNativeModules(root)).filter((name) => locked.has(name));
    expect(compared).toContain("react-native");
    expect(compared.length).toBeGreaterThan(10);
  });
});

describe("lockfileProblems", () => {
  it("finds nothing wrong with one React and native modules inside the SDK's ranges", () => {
    const text = lockfile(...ONE_REACT, "react-native-reanimated@4.5.1", "react-native-gesture-handler@2.32.4", "@expo/metro-runtime@57.0.16", "typescript@7.0.2");
    expect(lockfileProblems(text, SDK)).toEqual([]);
  });

  it.each(["react", "react-dom", "react-native"])("reports a second version of %s", (name) => {
    expect(lockfileProblems(lockfile(...ONE_REACT, `${name}@99.0.0`), {})).toEqual([
      `expected exactly one version of ${name} in the lockfile, found ${ONE_REACT.find((key) => key.startsWith(`${name}@`))!.split("@")[1]} and 99.0.0`,
    ]);
  });

  it.each(["react", "react-dom", "react-native"])("reports a lockfile without %s", (name) => {
    const rest = ONE_REACT.filter((key) => !key.startsWith(`${name}@`));
    expect(lockfileProblems(lockfile(...rest), {})).toEqual([`expected exactly one version of ${name} in the lockfile, found none`]);
  });

  it("reports react-native-web, in the SDK's range or not, and says nothing of its version", () => {
    expect(lockfileProblems(lockfile(...ONE_REACT, "react-native-web@0.21.2"), SDK)).toEqual([
      "react-native-web@0.21.2 is in the lockfile: nothing uses react-native-web (spec §0)",
    ]);
    expect(lockfileProblems(lockfile(...ONE_REACT, "react-native-web@0.19.13"), SDK)).toEqual([
      "react-native-web@0.19.13 is in the lockfile: nothing uses react-native-web (spec §0)",
    ]);
  });

  it("does not take its neighbours for react-native-web", () => {
    expect(lockfileProblems(lockfile(...ONE_REACT, "babel-plugin-react-native-web@0.21.3", "react-native-webview@13.16.0"), SDK)).toEqual([]);
  });

  it("reports a native module newer than the SDK's exact pin", () => {
    expect(lockfileProblems(lockfile(...ONE_REACT, "react-native-reanimated@4.7.0"), SDK)).toEqual([
      "react-native-reanimated@4.7.0 is in the lockfile, but this Expo SDK expects 4.5.1",
    ]);
  });

  it("reports a native module outside the SDK's range", () => {
    expect(lockfileProblems(lockfile(...ONE_REACT, "react-native-gesture-handler@3.3.0"), SDK)).toEqual([
      "react-native-gesture-handler@3.3.0 is in the lockfile, but this Expo SDK expects ~2.32.0",
    ]);
  });

  it("reports a native module locked from a URL that holds an @", () => {
    expect(lockfileProblems(lockfile(...ONE_REACT, "react-native-reanimated@git+https://git@github.com/x/reanimated.git#abc123"), SDK)).toEqual([
      "react-native-reanimated@git+https://git@github.com/x/reanimated.git#abc123 is in the lockfile, but this Expo SDK expects 4.5.1",
    ]);
  });

  it("checks every locked version of a module, and reads a scoped name", () => {
    const text = lockfile(...ONE_REACT, "@expo/metro-runtime@57.0.16", "@expo/metro-runtime@58.0.0");
    expect(lockfileProblems(text, SDK)).toEqual(["@expo/metro-runtime@58.0.0 is in the lockfile, but this Expo SDK expects ~57.0.16"]);
  });

  it("reports the React the SDK does not expect, as well as there being two", () => {
    expect(lockfileProblems(lockfile(...ONE_REACT, "react-dom@19.2.8"), SDK)).toEqual([
      "expected exactly one version of react-dom in the lockfile, found 19.2.3 and 19.2.8",
      "react-dom@19.2.8 is in the lockfile, but this Expo SDK expects 19.2.3",
    ]);
  });

  it("throws on a lockfile with no packages section, rather than finding nothing in it", () => {
    expect(() => lockfileProblems("lockfileVersion: '9.0'\n", SDK)).toThrow("the lockfile has no packages section");
  });
});

describe("lockedVersions", () => {
  it("reads name and version from each key, scoped or not, and ignores a peer suffix", () => {
    const locked = lockedVersions(lockfile("react@19.2.3", "@expo/metro-runtime@57.0.16", "@expo/metro-runtime@58.0.0", "expo-router@57.0.24(react@19.2.3)"));
    expect([...locked]).toEqual([
      ["react", ["19.2.3"]],
      ["@expo/metro-runtime", ["57.0.16", "58.0.0"]],
      ["expo-router", ["57.0.24"]],
    ]);
  });

  // A package locked from a git URL or a tarball: the version is the URL, and a URL can hold an "@".
  it("splits a key at the first @ after the scope, not at the last", () => {
    const locked = lockedVersions(lockfile("react-native-reanimated@git+https://git@github.com/x/reanimated.git#abc123", "@expo/metro-runtime@https://codeload.github.com/expo/expo/tar.gz/abc@def"));
    expect([...locked]).toEqual([
      ["react-native-reanimated", ["git+https://git@github.com/x/reanimated.git#abc123"]],
      ["@expo/metro-runtime", ["https://codeload.github.com/expo/expo/tar.gz/abc@def"]],
    ]);
  });

  it.each(["react", "@expo/metro-runtime"])("throws on the key %s, which names no version", (key) => {
    expect(() => lockedVersions(lockfile("react@19.2.3", key))).toThrow(`cannot read "${key}" in the lockfile's packages section as name@version`);
  });
});

describe("readBundledNativeModules", () => {
  it("reads Expo's list from the mobile app's node_modules", () => {
    const repo = mkdtempSync(join(tmpdir(), "boundaries-lockfile-"));
    try {
      const file = join(repo, "apps/mobile/node_modules/expo/bundledNativeModules.json");
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ "expo-camera": "~57.0.9" }));
      expect(readBundledNativeModules(repo)).toEqual({ "expo-camera": "~57.0.9" });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("fails, saying to install the workspace, when the list is not there", () => {
    const repo = mkdtempSync(join(tmpdir(), "boundaries-lockfile-"));
    try {
      expect(() => readBundledNativeModules(repo)).toThrow("is missing: install the workspace (pnpm install) before running this check");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
