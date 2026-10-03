import { expect, test } from "@playwright/test";

/**
 * The app while it is rebuilt (phase 1, slice A), signed out like every spec.
 *
 * The retired pages answer "being rebuilt", the home page sends a visitor to
 * the explorer, and the explorer works on its own: nothing it calls may need
 * the retired store, a session or auth. The unit tests cover each piece; this
 * is the one place that sees which routes a real browser actually reaches.
 *
 * Production is not tested here. There `proxy.ts` rewrites every path to
 * `/rebuilding`, which `lib/proxy.test.ts` pins, and this server runs as
 * development, where the proxy passes everything through.
 */

const HEADING = { level: 1, name: "Being rebuilt" } as const;
const EXPLORER_LINK = { name: "Explore destinations" } as const;

/** The reference-data routes slice A keeps. Everything else under /api/ is retired. */
const KEPT_ROUTES = [
  "/api/airports/search",
  "/api/destinations",
  "/api/destinations/resolve",
  "/api/map/airports",
  "/api/map/cities",
];

test("the home page says the app is being rebuilt, and opens the explorer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", HEADING)).toBeVisible();

  await page.getByRole("link", EXPLORER_LINK).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("navigation", { name: "Progress" })).toBeVisible();
});

for (const path of ["/rebuilding", "/trip/abc", "/b/abc", "/account", "/login", "/signup"]) {
  test(`${path} says the app is being rebuilt, with no way into the explorer`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", HEADING)).toBeVisible();
    await expect(page.getByRole("link", EXPLORER_LINK)).toHaveCount(0);
  });
}

test("the explorer reaches only the kept reference routes, all the way to the plan", async ({ page }) => {
  // Recorded from before navigation, so a request fired during hydration is
  // caught too. Method and path, so a POST to a kept path would still show.
  const calls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) calls.push(`${request.method()} ${path}`);
  });

  await page.goto("/plan");
  await page.getByRole("button", { name: /Next/ }).first().click();
  await page.getByRole("combobox", { name: "Or pick from the list" }).selectOption({ label: "Peru" });
  await expect(page.getByRole("group", { name: "Map of Peru" })).toBeVisible({ timeout: 30_000 });

  // A GeoNames city picked from the search: before slice A this pick also
  // asked the retired /api/cities/enrich for a description. The search's own
  // request is debounced and a pick cancels it, so it is waited for first.
  const searched = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/destinations"
  );
  await page.getByRole("combobox", { name: "Where are you going?" }).fill("Cusco");
  await searched;
  await page.getByRole("option", { name: /^Cusco/ }).first().click();
  await expect(page.getByRole("list", { name: "Selected places" })).toContainText("Cusco");

  await page.getByRole("button", { name: /Build my plan/ }).click();
  await expect(page.getByRole("heading", { name: "Shared trips are being rebuilt" })).toBeVisible({
    timeout: 30_000,
  });

  // Armed: the walk really reached the routes it is meant to exercise.
  const paths = calls.map((call) => call.split(" ")[1]);
  expect(paths).toContain("/api/map/cities");
  expect(paths).toContain("/api/destinations");
  expect(paths).toContain("/api/destinations/resolve");

  const stray = calls.filter((call) => {
    const [method, path] = call.split(" ");
    return method !== "GET" || !KEPT_ROUTES.includes(path);
  });
  expect(stray).toEqual([]);
});
