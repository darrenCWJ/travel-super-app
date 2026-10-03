import { sep } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The repo's first end-to-end tests, and the reason they exist.
 *
 * Every test in this project before now ran in jsdom, which parses HTML and
 * computes NO layout: `getBoundingClientRect` is all zeroes there, and CSS
 * variables like `--tap-min` are strings nothing resolves. So the phase's
 * accessibility criterion — WCAG 2.2 AA 2.5.8, a 44x44 CSS px target — was
 * asserted as viewBox arithmetic against a number the test itself computed.
 * That arithmetic was right, and it was never once checked against a browser.
 *
 * These specs measure the rendered box instead. They are deliberately few:
 * the value is in the things jsdom structurally cannot answer — real layout,
 * real CSS, the routes a real browser actually reaches — and not in restating
 * what the unit tests already hold.
 *
 * Every spec runs signed out. Sign-in, the store and the trip pages are retired
 * while the app is rebuilt (phase 1, slice A), so there is no session to set
 * up and nothing that needs one: the explorer on /plan and the "being rebuilt"
 * pages are all there is to test.
 *
 * Port 3100 rather than 3000, and pinned rather than `autoPort`: `baseURL` has
 * to be known before the server starts, and 3000 is the port a developer is
 * most likely to already be using.
 */

/**
 * The checkouts nested inside this one, under `.claude/worktrees/<name>/`.
 *
 * Anchored at this file's own directory because Playwright matches
 * `testIgnore` against each file's ABSOLUTE path. The unanchored `.claude`
 * glob this replaces also matched every spec of a checkout that itself lives
 * under `.claude/worktrees/`, so `npx playwright test` there found no tests.
 *
 * Collection only walks `testDir`, so while that is `./e2e` a nested checkout
 * is out of reach regardless; this keeps it out if `testDir` ever widens, as
 * long as Playwright is started from the checkout's real path. Node resolves
 * `__dirname` through junctions and symlinks, while Playwright keeps the path
 * it was given, so re-check `--list` from the path you use if you widen it.
 *
 * A RegExp rather than a glob built from the path, which would read a `[` or
 * `{` in it as syntax. On Windows Playwright also tests RegExps against a
 * `/`-separated copy of the path, hence `/` here, and `i` because paths there
 * ignore case. `__dirname` exists because the repo is CommonJS. Escaped by
 * hand because `RegExp.escape` needs Node 24 and nothing else here does.
 */
const nestedCheckouts = new RegExp(
  `^${escapeRegExp(__dirname.split(sep).join("/"))}/\\.claude/`,
  "i",
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** §5.3's tap targets are a claim about phones, so their spec runs at a phone width. */
const PHONE_SPECS = /tap-targets\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: [nestedCheckouts, "**/node_modules/**"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker, everywhere. The shared resource is a single `next dev`, which
  // compiles a route on first request: running specs in parallel does not make
  // them faster, it makes several of them wait on the same compile at once and
  // then time out together. Measured — eleven parallel specs all hit the 60s
  // ceiling on a server that answers one of them in about two seconds.
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  // `next dev` compiles a route on first request, so the first navigation in a
  // cold run is seconds rather than milliseconds.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      // Every spec but the phone one, at a desktop width. Selected by
      // exclusion, so a new spec runs here without anyone remembering to list it.
      name: "chromium",
      testIgnore: PHONE_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 390px is the iPhone 12/13/14 CSS width and the figure the unit tests quote.
      name: "mobile",
      testMatch: PHONE_SPECS,
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: "http://localhost:3100/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // `next dev` runs as development whatever the shell says, and so does the
      // Vercel environment `proxy.ts` reads: with VERCEL_ENV=production it
      // rewrites every path to /rebuilding and no explorer spec could pass.
      // Next never overrides a variable that is already set with one from a
      // .env file, so this also outranks a production .env.local pulled with
      // `vercel env pull`.
      NODE_ENV: "development",
      VERCEL_ENV: "development",
    },
  },
});
