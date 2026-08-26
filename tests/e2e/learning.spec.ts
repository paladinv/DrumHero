import { expect, test } from "@playwright/test";

test.beforeEach(async({page})=>{await page.goto("/learn");await page.evaluate(()=>localStorage.clear());await page.reload()});

test("filters, completes, and restores a lesson",async({page})=>{
  await page.getByRole("button",{name:"Advanced"}).click();await expect(page.getByText("Layer independence")).toBeVisible();await expect(page.getByText("Meet the kit")).toBeHidden();
  await page.getByRole("button",{name:"All"}).click();const lesson=page.locator("article").filter({hasText:"Meet the kit"});await lesson.getByRole("button",{name:"Mark complete"}).click();await expect(lesson.getByText("Completed")).toBeVisible();await page.reload();await expect(page.locator("article").filter({hasText:"Meet the kit"}).getByText("Completed")).toBeVisible();
});

test("lesson practice handoff selects the intended pattern",async({page})=>{
  const lesson=page.locator("article").filter({hasText:"Count the grid"});await lesson.getByRole("link",{name:"Practice"}).click();await expect(page).toHaveURL(/pattern=single-stroke/);await expect(page.getByRole("combobox",{name:"Pattern"})).toHaveValue("single-stroke");
});
