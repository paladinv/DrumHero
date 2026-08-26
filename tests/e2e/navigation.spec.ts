import { expect, test } from "@playwright/test";

const routes:[string,RegExp][]=[
  ["/",/Build the beat/i],["/learn",/clear path/i],["/practice",/every hit/i],["/rudiments",/with intent/i],
  ["/grooves",/between hits/i],["/kit",/for years/i],["/progress",/without pressure/i],["/about",/Practice deliberately/i]
];

test.describe("primary navigation",()=>{
  for(const [route,heading] of routes)test(`${route} renders meaningful content`,async({page})=>{
    const errors:string[]=[];page.on("console",(message)=>{if(message.type()==="error")errors.push(message.text())});page.on("pageerror",(error)=>errors.push(error.message));
    await page.goto(route);await expect(page.getByRole("heading",{level:1})).toContainText(heading);await expect(page.locator("main")).toBeVisible();expect(errors).toEqual([]);
  });
  test("header links navigate and identify the current page",async({page},testInfo)=>{await page.goto("/");if(testInfo.project.name==="mobile-chromium")await page.getByRole("button",{name:/Menu/}).click();await page.getByRole("link",{name:"Learn",exact:true}).click();await expect(page).toHaveURL(/\/learn$/);if(testInfo.project.name==="mobile-chromium")await page.getByRole("button",{name:/Menu/}).click();await expect(page.getByRole("link",{name:"Learn",exact:true})).toHaveAttribute("aria-current","page")});
});
