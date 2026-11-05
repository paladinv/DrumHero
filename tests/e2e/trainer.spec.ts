import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/trainer?pattern=single-stroke"); });

test("guided entry offers an easy start and a custom section arrangement", async ({ page }) => {
  await expect(page.getByRole("group", { name: "Choose how to practise" })).toBeVisible();
  await page.getByRole("button", { name: /Easy start/ }).click();
  await expect(page.getByText(/Beginner setup ready/)).toBeVisible();

  const advanced = page.locator("#trainer-advanced");
  if (!await advanced.evaluate(element => (element as HTMLDetailsElement).open)) await advanced.locator("summary").first().click();
  const builder = page.locator(".trainer-song-form-builder");
  await expect(builder).toBeVisible();
  await builder.getByRole("combobox", { name: "Form" }).selectOption("Custom");
  await expect(builder.getByRole("status")).toContainText("Custom form length: 12 bars");
  await builder.getByLabel("Section 1 intensity").selectOption("soft");
  await builder.getByRole("button", { name: "Build and add form to Trainer library" }).click();
  await expect(page.getByText(/Added .* to the local Trainer groove library/)).toBeVisible();
  await expect(page.locator(".trainer-setup > label > select").first()).toHaveValue(/^custom-/);
});

test("self-rated round pauses for each rating and reaches a recap", async ({ page }) => {
  await page.getByRole("button", { name: "Start round" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? "{}").mode)).toBe("count-in");
  for (let index = 0; index < 10; index++) {
    await page.evaluate(() => window.advanceTime?.(9000));
    await expect(page.getByRole("group", { name: "Rate repetition" })).toBeVisible();
    await page.getByRole("button", { name: "Clean", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Round recap" })).toBeVisible();
  await expect(page.getByText("10 clean", { exact: true })).toBeVisible();
  await page.getByText("Practice notes and tags", { exact: true }).click();
  await page.locator(".trainer-round-journal li details summary").first().click();
  await page.getByLabel("Round note").first().fill("Keep the left hand relaxed.");
  await page.getByLabel("Focused practice").first().check();
  await page.reload();
  await page.getByText("Practice notes and tags", { exact: true }).click();
  await page.locator(".trainer-round-journal li details summary").first().click();
  await expect(page.getByLabel("Round note").first()).toHaveValue("Keep the left hand relaxed.");
  await expect(page.getByLabel("Focused practice").first()).toBeChecked();
  await page.goto("/progress");
  await expect(page.getByText(/Trainer · 70 BPM · 10\/10 clean/)).toBeVisible();
});

test("sticking practice, voice layers, notation, and review reminders are available", async ({ page }) => {
  await page.getByLabel("Choose a sticking exercise").selectOption("rudiment-five-stroke-roll");
  await expect(page.getByText(/Sticking: R R L L R L L R R L/)).toBeVisible();
  await page.getByLabel("Show drum staff notation").check();
  await expect(page.getByRole("group", { name: /Five-stroke roll drum staff notation/ })).toBeVisible();

  await page.locator(".trainer-setup > label > select").first().selectOption("first-beat");
  const advanced = page.locator("#trainer-advanced");
  if (!await advanced.evaluate(element => (element as HTMLDetailsElement).open)) await advanced.locator("summary").first().click();
  await page.locator(".trainer-voice-practice").getByLabel("Voice practice").selectOption("layers");
  await page.getByLabel("Layers to play together").selectOption("2");
  await expect(page.locator(".trainer-stage h2")).toContainText("layers 2/3");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  await page.getByText(/Review reminders ·/).click();
  await page.getByLabel("Review on").fill(dueDate);
  await page.getByRole("button", { name: "Set reminder" }).click();
  await expect(page.getByText("Review on", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open backup and restore" })).toHaveAttribute("href", "/progress#data-backup");
});

test("scored round supports keyboard input, pause, and reset", { tag: "@smoke" }, async ({ page }) => {
  await page.getByLabel("Score played hits").check();
  await page.getByRole("button", { name: "Start round" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? "{}").mode)).toBe("count-in");
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
  await expect(page.getByText(/Calibrate each drum voice for reliable classification/i)).toBeVisible();
});

test("cue setup offers voice dropouts, accent shifts, and round-wide random spacing", async ({ page }) => {
  await page.getByRole("combobox", { name: "Pattern" }).selectOption("straight-pop");
  await page.getByText("Practice options, routines, and advanced settings").click();

  const cueMode = page.getByLabel("Call for");
  await cueMode.selectOption("dropout");
  await expect(page.getByLabel("Voice to drop")).toHaveValue("hihat");
  await expect(page.getByText(/leave hihat silent for the rest of that bar/i)).toBeVisible();

  await cueMode.selectOption("accent-shift");
  await expect(page.getByText(/emphasize hits on beat 1; keep the other strokes soft/i)).toBeVisible();

  await cueMode.selectOption("random");
  await page.getByLabel("Cue spacing").selectOption("4");
  await expect(page.getByText(/cues are spaced across all bars, including repeats of a single-bar groove/i)).toBeVisible();
});

test("saves a custom cue sequence and builds a scored song form", async ({ page }) => {
  await page.getByText("Practice options, routines, and advanced settings").click();
  await page.getByLabel("Call for").selectOption("custom");
  await page.getByLabel("Sequence name").fill("Verse and chorus cues");
  await page.locator(".trainer-cue-sequence-add").getByLabel("Response").selectOption("soft");
  await page.locator(".trainer-cue-sequence-add").getByLabel("Beat").selectOption("3");
  await page.getByRole("button", { name: "Add response" }).click();
  await page.getByRole("button", { name: "Save cue sequence" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved “Verse and chorus cues”" })).toBeVisible();
  await page.reload();
  const advancedOptions = page.locator(".trainer-advanced");
  if (!await advancedOptions.evaluate(element => (element as HTMLDetailsElement).open)) await advancedOptions.locator("summary").click();
  await page.getByLabel("Call for").selectOption("custom");
  await page.getByLabel("Saved sequences").selectOption({ label: "Verse and chorus cues" });
  await expect(page.getByLabel("Sequence name")).toHaveValue("Verse and chorus cues");

  await page.getByLabel("Form name").fill("Practice AABA");
  await page.locator(".trainer-song-form-builder select").first().selectOption("AABA");
  await page.getByRole("button", { name: "Build and add form to Trainer library" }).click();
  await expect(page.locator(".trainer-setup > label > select").first()).toHaveValue(/^custom-/);
  await expect(page.getByText(/Added Practice AABA to the local Trainer groove library/)).toBeVisible();
});

test("loads a Trainer backing challenge in Play-Along Studio", async ({ page }) => {
  await page.goto("/play-alongs?trainerChallenge=1&name=Practice%20AABA&bpm=110&style=funk");
  await expect(page.getByRole("status").filter({ hasText: "Trainer challenge loaded · Practice AABA · funk · 110 BPM" })).toBeVisible();
  await expect(page.getByLabel("Backing style")).toHaveValue("funk");
  await expect(page.locator(".playalong-controls select").nth(1)).toHaveValue("full-form");
});

test("scores a Trainer round with synchronized backing and identifies it in the recap", async ({ page }) => {
  await page.getByText("Practice options, routines, and advanced settings").click();
  await page.getByLabel("Score played hits").check();
  await page.getByLabel("Add synchronized backing band to scored rounds").check();
  await page.getByLabel("Backing style").selectOption("shuffle");
  await page.getByRole("button", { name: "Start round" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? "{}").mode)).toBe("count-in");
  await page.evaluate(() => window.advanceTime?.(60000));
  await expect(page.getByText(/Play-along challenge · shuffle backing was synchronized to this \d+ BPM round/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the matching Play-Along Studio setup" })).toHaveAttribute("href", /trainerChallenge=1/);
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
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? "{}").mode)).toBe("count-in");
  await page.evaluate(() => { const state = JSON.parse(window.render_game_to_text?.() ?? "{}"); window.advanceTime?.(Math.max(0, state.nextTargetInMs ?? 0) + 20); (window as Window & { testMidiHit?: (note: number) => void }).testMidiHit?.(38); });
  await expect(page.locator(".trainer-last-hit")).toContainText(/snare/i);
  await expect(page.getByText(/MIDI note 38 → snare/)).toBeVisible();
});
