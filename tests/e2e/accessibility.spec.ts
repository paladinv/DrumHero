import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("dashboard, trainer, and practice have no serious axe violations",async({page})=>{
  for(const route of ["/","/trainer","/practice"]){await page.goto(route);const results=await new AxeBuilder({page}).disableRules(["color-contrast"]).analyze();expect(results.violations.filter((item)=>["serious","critical"].includes(item.impact??""))).toEqual([])}
});

test("skip link and primary controls accept keyboard focus",async({page},testInfo)=>{test.skip(testInfo.project.name==="mobile-chromium","desktop-keyboard flow");await page.goto("/");const skip=page.getByRole("link",{name:"Skip to content"});await skip.focus();await expect(skip).toBeFocused();await page.keyboard.press("Enter");await expect(page).toHaveURL(/#main-content$/);await page.getByRole("link",{name:"Practice",exact:true}).focus();await page.keyboard.press("Enter");await expect(page).toHaveURL(/\/practice$/);await page.getByRole("button",{name:"Start 4-count"}).focus();await expect(page.getByRole("button",{name:"Start 4-count"})).toBeFocused()});

test("mobile menu discloses navigation and pads remain large",async({page},testInfo)=>{test.skip(testInfo.project.name!=="mobile-chromium","mobile-only");await page.goto("/");const menu=page.getByRole("button",{name:/Menu/});await expect(menu).toHaveAttribute("aria-expanded","false");await menu.click();await expect(menu).toHaveAttribute("aria-expanded","true");await page.getByRole("link",{name:"Practice",exact:true}).click();const box=await page.getByRole("button",{name:/Kick Space/i}).boundingBox();expect(box?.height).toBeGreaterThanOrEqual(90)});
