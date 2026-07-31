import { test } from "@playwright/test";

test.only("works", async ({ page }) => {
  await page.goto("about:blank");
});
