import { expect, test } from "@playwright/test";

const routes:[string,RegExp][]=[
  ["/",/Build the beat/i],["/learn",/clear path/i],["/trainer",/one round at a time/i],["/practice",/every hit/i],["/rudiments",/with intent/i],
  ["/grooves",/between hits/i],["/kit",/for years/i],["/play-alongs",/pocket/i],["/song-library",/Your Song Library/i],
  ["/song-builder",/Write the part you hear/i],["/progress",/without pressure/i],["/about",/Practice deliberately/i]
];

test.describe("primary navigation",()=>{
  for(const [route,heading] of routes)test(`${route} renders meaningful content`,{tag:"@smoke"},async({page})=>{
    const errors:string[]=[];page.on("console",(message)=>{if(message.type()==="error")errors.push(message.text())});page.on("pageerror",(error)=>errors.push(error.message));
    await page.goto(route);await expect(page.getByRole("heading",{level:1})).toContainText(heading);await expect(page.locator("main")).toBeVisible();expect(errors).toEqual([]);
  });
  test("primary links navigate and identify the current page",async({page},testInfo)=>{await page.goto("/");if(testInfo.project.name==="mobile-chromium")await page.getByRole("button",{name:/Menu/}).click();await page.getByRole("link",{name:"Learn",exact:true}).click();await expect(page).toHaveURL(/\/learn$/);if(testInfo.project.name==="mobile-chromium")await page.getByRole("button",{name:/Menu/}).click();await expect(page.getByRole("link",{name:"Learn",exact:true})).toHaveAttribute("aria-current","page");await page.getByRole("link",{name:"Songs",exact:true}).click();await expect(page).toHaveURL(/\/song-library$/)});
  test("specialist pages remain available from grouped navigation",async({page},testInfo)=>{await page.goto("/");if(testInfo.project.name==="mobile-chromium")await page.getByRole("button",{name:/Menu/}).click();const practiceGroup=page.locator(".site-nav-entry").filter({has:page.locator(".site-nav-link[href='/practice']")});await practiceGroup.locator("summary").click();await expect(page.getByRole("link",{name:"Trainer",exact:true})).toBeVisible();await page.getByRole("link",{name:"Trainer",exact:true}).click();await expect(page).toHaveURL(/\/trainer$/);await expect(practiceGroup.locator("details")).toHaveJSProperty("open",false)});
  test("query links restore lessons, patterns, songs, and searches",async({page})=>{
    await page.goto("/learn?lesson=meet-the-kit");
    await expect(page.locator("#lesson-meet-the-kit")).toHaveClass(/lesson-expanded/);
    await page.goto("/practice?pattern=single-stroke");
    await expect(page.getByRole("combobox",{name:"Pattern",exact:true})).toHaveValue("single-stroke");
    await page.goto("/song-library?song=example-open-sky");
    await expect(page.getByRole("heading",{name:"Open Sky",exact:true})).toBeVisible();
    await page.goto("/song-library?q=Open");
    await expect(page.getByRole("textbox",{name:"Search",exact:true})).toHaveValue("Open");
    await expect(page.getByRole("button",{name:/^Open Sky Drum Hero Originals/})).toBeVisible();
  });
  test("marks the current primary section on each route",async({page},testInfo)=>{
    const activeRoutes:Array<[string,string]>=[
      ["/","Home"],["/learn","Learn"],["/rudiments","Learn"],["/grooves","Learn"],["/kit","Learn"],
      ["/practice","Practice"],["/trainer","Practice"],["/play-alongs","Practice"],
      ["/song-library","Songs"],["/song-builder","Songs"],["/progress","Progress"]
    ];
    for(const [route,label] of activeRoutes){
      await page.goto(route);
      if(testInfo.project.name==="mobile-chromium")await page.getByRole("button",{name:/Menu/}).click();
      await expect(page.locator(".site-nav").getByRole("link",{name:label,exact:true})).toHaveAttribute("aria-current","page");
    }
  });
});
