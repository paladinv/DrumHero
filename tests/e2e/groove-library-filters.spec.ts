import { expect, test } from "@playwright/test";

test("groove library filters by meter, playable tempo, style, and practice focus", async ({ page }) => {
  await page.goto("/grooves");
  const cards = page.locator(".card-grid article");

  await page.getByLabel("Meter", { exact: true }).selectOption("4/4");
  await page.getByLabel("Tempo range", { exact: true }).selectOption("140-plus");
  await page.getByLabel("Style", { exact: true }).selectOption("Punk");
  await page.getByLabel("Practice focus", { exact: true }).selectOption("Keep the eighth notes even at a brisk tempo");

  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading", { name: "Punk Drive" })).toBeVisible();
});
