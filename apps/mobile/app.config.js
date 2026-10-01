// Plain JavaScript on purpose: Expo loads app.config.ts through TypeScript's
// JavaScript API, which TypeScript 7 does not have (spec §0). The identifiers
// are placeholders until the name is chosen in phase 3, and must be final
// before any store upload (phase 6).
module.exports = {
  name: "Travel super app",
  slug: "travel-super-app",
  scheme: "travelsuperapp",
  version: "0.0.0",
  orientation: "portrait",
  // No web target: the website is apps/web, and screens are never shared (spec §0).
  platforms: ["ios", "android"],
  ios: { bundleIdentifier: "com.darrencwj.travelsuperapp" },
  android: { package: "com.darrencwj.travelsuperapp" },
  plugins: [
    "expo-router",
    // CMake 3.31.6 or newer builds past Windows' 260-character paths. The
    // Android SDK must have this exact version installed (phase 0 plan, Task 9).
    ["expo-build-properties", { android: { cmakeVersion: "3.31.6" } }],
  ],
};
