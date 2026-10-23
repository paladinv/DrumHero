import { expect, test } from "@playwright/test";

async function selectLanguage(page: import("@playwright/test").Page, locale: string) {
  const picker = page.locator(".language-picker select");
  if (!(await picker.isVisible())) {
    const menu = page.locator(".menu-button");
    if (await menu.isVisible() && await menu.getAttribute("aria-expanded") !== "true") await menu.click();
    await page.locator(".site-settings > summary").click();
  }
  await picker.selectOption(locale);
}

test("uses device language until a saved language choice overrides it", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-CA" });
  const page = await context.newPage();
  const response = await page.goto("/learn");
  expect(await response?.text()).toContain("<title>Apprendre | Drum Hero</title>");
  expect(await response?.text()).toContain("name=\"description\" content=\"Un studio de pratique consacré à la technique de batterie");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Construisez le rythme");

  await selectLanguage(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("link", { name: "الرئيسية" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.goto("/practice");
  await expect.poll(() => page.locator(".timeline").evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
  await context.close();
});

test("localizes dashboard tool cards from the selected catalog", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-MX" });
  const page = await context.newPage();
  await page.goto("/");
  const learnShortcut = page.locator('a.dashboard-shortcut[href="/learn"]');
  await expect(learnShortcut).toContainText("Ruta de aprendizaje");
  const practiceGroup = page.locator(".site-nav-entry").filter({ has: page.locator('.site-nav-link[href="/practice"]') });
  await practiceGroup.locator("summary").click();
  await expect(page.getByRole("link", { name: "Entrenador", exact: true })).toBeVisible();
  await context.close();
});

test("localizes built-in lesson titles and summaries by lesson ID", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-MX" });
  const page = await context.newPage();
  await page.goto("/learn");
  const lesson = page.locator("article").filter({ hasText: "Conoce la batería" });
  await expect(lesson.getByRole("heading", { name: "Conoce la batería" })).toBeVisible();
  await expect(lesson).toContainText("Aprende las voces principales");
  await lesson.getByRole("button", { name: "Empezar lección" }).click();
  await expect(lesson.locator(".lesson-guide")).toContainText("Empieza a un tempo cómodo");
  await context.close();
});

test("localizes built-in groove names and coaching by pattern ID", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-MX" });
  const page = await context.newPage();
  await page.goto("/grooves");
  const firstPattern = page.locator(".card-grid .card").first();
  await expect(firstPattern.locator("h3")).not.toHaveText("Quarter Note Pulse");
  await expect(firstPattern.locator("p").first()).toContainText("Ejercicio");
  await context.close();
});

test("keeps an active practice round when the display language changes", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.goto("/practice?pattern=single-stroke");
  await page.getByRole("button", { name: "Start 4-count" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await selectLanguage(page, "es");
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await expect(page.getByText("playing", { exact: true })).toBeVisible();
});

test("keeps an unsaved song title and artist when the language changes", async ({ page }) => {
  await page.goto("/song-builder");
  await page.locator("#song-builder-new-title").fill("Unfinished arrangement");
  await page.getByLabel("Artist", { exact: true }).fill("Practice name");
  await selectLanguage(page, "pt-BR");
  await expect(page.locator("#song-builder-new-title")).toHaveValue("Unfinished arrangement");
  await expect(page.getByLabel("Artist", { exact: true })).toHaveValue("Practice name");
});

test("keeps a language choice when localStorage writes are blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "drumHero.language") throw new Error("storage blocked");
      original.call(this, key, value);
    };
  });
  await page.goto("/");
  await selectLanguage(page, "de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});
