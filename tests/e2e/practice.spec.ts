import { expect, test } from "@playwright/test";

async function enterPlaying(page:import("@playwright/test").Page,hitSnare=false){
  await page.getByRole("button",{name:"Start 4-count"}).click();
  await page.evaluate((shouldHit)=>{const state=JSON.parse(window.render_game_to_text?.()??"{}");window.advanceTime?.(Math.max(0,state.nextTargetInMs??0));if(shouldHit)window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyF",key:"f"}))},hitSnare);
  await expect(page.getByText("playing",{exact:true})).toBeVisible();
}

test.beforeEach(async({page})=>{await page.goto("/practice?pattern=single-stroke");await page.evaluate(()=>localStorage.clear());await page.reload()});

test("runs, pauses, resumes, resets, and changes configuration",async({page})=>{
  await enterPlaying(page);await page.getByRole("button",{name:"Pause"}).click();await expect(page.getByText("paused",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Resume"}).click();await expect(page.getByText("playing",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Reset"}).click();await expect(page.getByText("idle",{exact:true})).toBeVisible();
  await page.getByLabel("Tempo").fill("120");await expect(page.getByText("120 BPM")).toBeVisible();await page.getByRole("combobox",{name:"Pattern"}).selectOption("five-four-drive");await expect(page.getByRole("heading",{name:"Five-Four Drive"})).toBeVisible();await expect(page.getByText("105 BPM")).toBeVisible();
});

test("scores keyboard and pad input and records a result",async({page})=>{
  await enterPlaying(page,true);await expect(page.getByText(/ms · snare/i)).toBeVisible();await page.getByRole("button",{name:/Kick Space/i}).click();await expect(page.getByText("extra",{exact:true})).toBeVisible();await page.evaluate(()=>window.advanceTime?.(10000));await expect(page.getByRole("heading",{name:"Loop complete"})).toBeVisible();await page.goto("/progress");await expect(page.getByRole("heading",{name:"Single Stroke Roll"})).toBeVisible();
});

test("disabled Web Audio falls back to visual timing",async({browser})=>{
  const context=await browser.newContext();const page=await context.newPage();await page.addInitScript(()=>{Object.defineProperty(window,"AudioContext",{value:undefined});Object.defineProperty(window,"webkitAudioContext",{value:undefined})});await page.goto("/practice");await page.getByRole("button",{name:"Start 4-count"}).click();await expect(page.getByText(/Web Audio is unavailable/)).toBeVisible();await context.close();
});

test("corrupt local progress cannot break launch",async({page})=>{await page.evaluate(()=>localStorage.setItem("drum-hero:progress:v1","{"));await page.reload();await expect(page.getByRole("button",{name:"Start 4-count"})).toBeVisible()});
