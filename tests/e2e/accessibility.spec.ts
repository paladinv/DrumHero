import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("dashboard, trainer, practice, and Song Library have no serious axe violations",async({page})=>{
  for(const route of ["/","/trainer","/practice","/song-library"]){await page.goto(route);if(route==="/song-library")await expect(page.getByRole("tab",{name:"Overview",exact:true})).toBeVisible();const results=await new AxeBuilder({page}).disableRules(["color-contrast"]).analyze();expect(results.violations.filter((item)=>["serious","critical"].includes(item.impact??""))).toEqual([])}
});

test("skip link and primary controls accept keyboard focus",async({page},testInfo)=>{test.skip(testInfo.project.name==="mobile-chromium","desktop-keyboard flow");await page.goto("/");const skip=page.getByRole("link",{name:"Skip to content"});await skip.focus();await expect(skip).toBeFocused();await page.keyboard.press("Enter");await expect(page).toHaveURL(/#main-content$/);const group=page.locator(".site-nav-entry").filter({has:page.locator(".site-nav-link[href='/practice']")});await group.locator("summary").focus();await page.keyboard.press("Enter");const trainer=page.getByRole("link",{name:"Trainer",exact:true});await trainer.focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/\/trainer$/);await page.getByRole("button",{name:"Start practice"}).focus();await expect(page.getByRole("button",{name:"Start practice"})).toBeFocused()});

test("mobile menu discloses navigation and pads remain large",async({page},testInfo)=>{test.skip(testInfo.project.name!=="mobile-chromium","mobile-only");await page.goto("/");const menu=page.getByRole("button",{name:/Menu/});await expect(menu).toHaveAttribute("aria-expanded","false");await menu.click();await expect(menu).toHaveAttribute("aria-expanded","true");const group=page.locator(".site-nav-entry").filter({has:page.locator(".site-nav-link[href='/practice']")});await group.locator("summary").click();await expect(page.getByRole("link",{name:"Trainer",exact:true})).toBeVisible();await page.getByRole("link",{name:"Practice",exact:true}).click();const box=await page.getByRole("button",{name:/Kick Space/i}).boundingBox();expect(box?.height).toBeGreaterThanOrEqual(90)});

test("custom Trainer cues and play-along setup expose accessible controls", async ({ page }) => {
  await page.goto("/trainer");
  await expect(page.getByRole("group", { name: "Choose how to practise" })).toBeVisible();
  const guidedEntryAudit = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(guidedEntryAudit.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);

  await page.getByText("Practice options, routines, and advanced settings").click();
  await page.getByLabel("Call for").selectOption("custom");
  await expect(page.getByLabel("Sequence name")).toBeVisible();
  const trainerAudit = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(trainerAudit.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);

  const songFormBuilder = page.locator(".trainer-song-form-builder");
  await expect(songFormBuilder.getByRole("heading", { name: "Build a song form" })).toBeVisible();
  await songFormBuilder.getByRole("combobox", { name: "Form" }).selectOption("Custom");
  const customFormAudit = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(customFormAudit.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);

  await page.goto("/play-alongs?trainerChallenge=1&name=Accessibility%20check&bpm=96&style=rock");
  await expect(page.locator(".playalong-trainer-challenge")).toBeVisible();
  const playAlongAudit = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(playAlongAudit.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});
