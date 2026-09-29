import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/trainer?pattern=single-stroke"); });

test("self-rated round pauses for each rating and reaches a recap", async ({ page }) => {
  await page.getByRole("button", { name: "Start round" }).click();
  for (let index = 0; index < 10; index++) {
    await page.evaluate(() => window.advanceTime?.(9000));
    await expect(page.getByRole("group", { name: "Rate repetition" })).toBeVisible();
    await page.getByRole("button", { name: "Clean", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Round recap" })).toBeVisible();
  await expect(page.getByText("10 clean", { exact: true })).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByText(/Trainer · 70 BPM · 10\/10 clean/)).toBeVisible();
});

test("scored round supports keyboard input, pause, and reset", async ({ page }) => {
  await page.getByLabel("Score played hits").check();
  await page.getByRole("button", { name: "Start round" }).click();
  await page.evaluate(() => window.advanceTime?.(3500));
  await page.keyboard.press("f");
  await expect(page.locator(".trainer-last-hit")).toContainText(/snare/i);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("idle", { exact: true })).toBeVisible();
});

test("MIDI and audio input offer a safe fallback", async ({ page }) => {
  await page.getByLabel("Score played hits").check();
  await page.getByLabel("Scored input").selectOption("midi");
  await page.getByRole("button", { name: "Connect USB MIDI" }).click();
  await expect(page.getByText(/Web MIDI is unavailable|MIDI access/)).toBeVisible();
  await page.getByLabel("Scored input").selectOption("audio-voices");
  await expect(page.getByText(/experimental and uncertain hits are ignored/i)).toBeVisible();
});

test("connected MIDI note scores a mapped drum voice", async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: "test-kit", name: "Test drum kit", onmidimessage: null as null | ((event: { data: Uint8Array }) => void) };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => ({ inputs: new Map([[input.id, input]]), onstatechange: null }) });
    Object.defineProperty(window, "testMidiHit", { value: (note: number) => input.onmidimessage?.({ data: new Uint8Array([0x99, note, 100]) }) });
  });
  await page.reload();
  await page.getByLabel("Score played hits").check();
  await page.getByLabel("Scored input").selectOption("midi");
  await page.getByRole("button", { name: "Connect USB MIDI" }).click();
  await expect(page.getByText("Test drum kit")).toBeVisible();
  await page.getByRole("button", { name: "Start round" }).click();
  await page.evaluate(() => { const state = JSON.parse(window.render_game_to_text?.() ?? "{}"); window.advanceTime?.(Math.max(0, state.nextTargetInMs ?? 0) + 20); (window as Window & { testMidiHit?: (note: number) => void }).testMidiHit?.(38); });
  await expect(page.locator(".trainer-last-hit")).toContainText(/snare/i);
  await expect(page.getByText(/MIDI note 38 → snare/)).toBeVisible();
});
