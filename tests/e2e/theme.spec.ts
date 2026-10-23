import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openAppearance(page: import("@playwright/test").Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: /Menu/ }).click();
  await page.locator(".site-settings > summary").click();
  return page.getByRole("combobox", { name: "Color theme" });
}

async function pageBackground(page: import("@playwright/test").Page) {
  return page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
}

test("System theme follows device changes while the app is open", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect.poll(() => pageBackground(page)).toBe("rgb(33, 31, 29)");

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pageBackground(page)).toBe("rgb(245, 243, 238)");

  const theme = await openAppearance(page, testInfo.project.name === "mobile-chromium");
  await expect(theme).toHaveValue("system");
});

test("explicit Light and Dark choices persist and override the device", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  let theme = await openAppearance(page, testInfo.project.name === "mobile-chromium");
  await theme.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => pageBackground(page)).toBe("rgb(33, 31, 29)");
  await expect(page.locator("html")).toHaveJSProperty("dataset.theme", "dark");
  await expect.poll(() => page.evaluate(() => document.cookie)).toContain("drumHeroTheme=dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pageBackground(page)).toBe("rgb(33, 31, 29)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => pageBackground(page)).toBe("rgb(33, 31, 29)");

  theme = await openAppearance(page, testInfo.project.name === "mobile-chromium");
  await theme.selectOption("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => pageBackground(page)).toBe("rgb(245, 243, 238)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => pageBackground(page)).toBe("rgb(245, 243, 238)");
});

test("dark theme has no serious or critical accessibility violations on core pages", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const allSerious: Array<{ route: string; id: string; impact: string | null | undefined; help: string; elements: unknown[] }> = [];

  for (const route of ["/", "/learn", "/practice", "/trainer", "/song-library", "/song-builder", "/progress"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
      .map(({ id, impact, help, nodes }) => ({ route, id, impact, help, elements: nodes.slice(0, 8).map((node) => node.target) }));

    allSerious.push(...serious);
  }

  expect(allSerious).toEqual([]);
});
