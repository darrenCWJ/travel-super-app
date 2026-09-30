import { defineConfig } from "vitest/config";

// Its own config on purpose: without one, Vitest walks up and picks up another package's.
export default defineConfig({ test: { include: ["*.test.ts"], environment: "node" } });
