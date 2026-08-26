import { expect, test } from "@playwright/test";

test.use({viewport:{width:1280,height:900},colorScheme:"light"});
test("dashboard",async({page})=>{await page.goto("/");await expect(page).toHaveScreenshot("dashboard.png",{fullPage:true,animations:"disabled"})});
test("curriculum",async({page})=>{await page.goto("/learn");await expect(page).toHaveScreenshot("curriculum.png",{fullPage:true,animations:"disabled"})});
test("practice idle and results",async({page})=>{await page.goto("/practice?pattern=single-stroke");await expect(page).toHaveScreenshot("practice-idle.png",{fullPage:true,animations:"disabled"});await page.getByRole("button",{name:"Start 4-count"}).click();await page.evaluate(()=>window.advanceTime?.(10000));const resultHeading=page.getByRole("heading",{name:"Loop complete"});await expect(resultHeading).toBeVisible();await expect(resultHeading).toBeFocused();await expect(page).toHaveScreenshot("practice-results.png",{fullPage:true,animations:"disabled"})});
test("mobile navigation",async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto("/");await page.getByRole("button",{name:/Menu/}).click();await expect(page).toHaveScreenshot("mobile-navigation.png",{fullPage:true,animations:"disabled"})});
