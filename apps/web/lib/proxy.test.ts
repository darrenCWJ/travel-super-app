import { afterEach, describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
// `unstable_doesMiddlewareMatch`, not the `unstable_doesProxyMatch` that
// Next 16.3.6's own proxy.md names: that export does not exist in this release
// (only the docs mention it). This is the same function under its old name.
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { config, proxy } from "@/proxy";

/**
 * proxy.ts itself lives at the repo root, not under lib/ — this file sits
 * here anyway because it's the only `.test.ts` location vitest.config.mts's
 * node project already picks up, and proxy.ts is plain Node-runnable logic
 * (NextRequest/NextResponse work outside an actual Next server).
 *
 * While the app is rebuilt (phase 1, slice A) the proxy is production's
 * switch: there, every path it sees becomes the "being rebuilt" page. On a
 * preview and in local development it passes everything through, so the
 * explorer keeps working where it is tested.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function inVercelEnv(value: string | undefined) {
  if (value === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = value;
}

describe("in production, every path is the being-rebuilt page", () => {
  test.each([
    "/",
    "/plan",
    "/api/destinations?q=lima&country=PE",
    "/world-globe.json",
    "/trip/abc",
  ])("rewrites %s to /rebuilding, and keeps it out of every cache", async (path) => {
    inVercelEnv("production");
    const res = await proxy(new NextRequest(`https://example.com${path}`));

    expect(isRewrite(res)).toBe(true);
    expect(getRewrittenUrl(res)).toBe("https://example.com/rebuilding");
    // next.config.ts gives the topology assets a day-long public cache, and
    // its headers run before the proxy. A cached "being rebuilt" answer under
    // an asset's URL would outlive the rebuild.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("everywhere else, the proxy stands aside", () => {
  test.each([["preview"], ["development"], [undefined]])(
    "VERCEL_ENV=%s passes every path through",
    async (value) => {
      inVercelEnv(value);
      for (const path of ["/", "/plan", "/api/destinations", "/world-globe.json"]) {
        const res = await proxy(new NextRequest(`https://example.com${path}`));
        expect(isRewrite(res), path).toBe(false);
        // What `NextResponse.next()` sets: carry on to the route itself.
        expect(res.headers.get("x-middleware-next"), path).toBe("1");
      }
    }
  );
});

/**
 * Which paths the proxy is asked about at all. A path the matcher excludes is
 * a path production would serve in full, so the exemptions stay the three
 * build-output ones and nothing else.
 *
 * Compiled the way Next compiles a proxy's matcher, through the testing
 * helper above, so these are the real semantics rather than a regex
 * re-implementation.
 */
describe("proxy matcher", () => {
  const seen = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  test("sees every page, route and public file", () => {
    for (const path of [
      "/",
      "/plan",
      "/rebuilding",
      "/trip/abc123",
      "/api/destinations",
      "/world-globe.json",
      "/cities/PE.json",
    ]) {
      expect(seen(path), path).toBe(true);
    }
  });

  test("excludes only the three build-output exemptions", () => {
    for (const path of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) {
      expect(seen(path), path).toBe(false);
    }
  });
});
