import { expect, test } from "@playwright/test";

/**
 * The app while it is rebuilt (phase 1, slice A), signed out like every spec.
 *
 * The retired pages answer "being rebuilt", and the home page sends a visitor
 * to the explorer.
 *
 * Production is not tested here. There `proxy.ts` rewrites every path to
 * `/rebuilding`, which `lib/proxy.test.ts` pins, and this server runs as
 * development, where the proxy passes everything through.
 */

const HEADING = { level: 1, name: "Being rebuilt" } as const;
const EXPLORER_LINK = { name: "Explore destinations" } as const;

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
