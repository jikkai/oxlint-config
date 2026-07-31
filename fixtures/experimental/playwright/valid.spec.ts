import { test } from "@playwright/test";

test("works", async ({ page }) => {
  await page.goto("about:blank");
});
