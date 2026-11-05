import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("rhythm ear training", () => {
  test("recognition hides the answer, saves results, and keeps retries separate", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("identify");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Choose A", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("table")).toHaveCount(4);
    await page.getByRole("button", { name: "Choose A", exact: true }).click();
    await expect(page.getByRole("group", { name: "Target rhythm", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 }).first()).toBeFocused();
    const results = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ mode: "identify", assisted: false });
    await page.getByRole("button", { name: "Retry this rhythm", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Choose A", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Choose A", exact: true }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results[1].assisted)).toBe(true);
    await page.reload();
    await expect(page.getByText("2 saved attempts on this learner profile", { exact: true })).toBeVisible();
  });

  test("playing an empty answer reports misses and provides a revealed rhythm", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play my answer", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("button", { name: "Play my answer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your rhythm recap", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Great: 0 · Good: 0 · Missed: \d+ · Extra: 0/)).toBeVisible();
    await expect(page.getByRole("group", { name: "Target rhythm", exact: true })).toBeVisible();
  });

  test("stop cancels pending audio and navigation exposes the new tool", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByText("Listen: 1 count-in bar, then a 1-bar phrase. Remember the rhythm.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("button", { name: "Listen again", exact: true })).toBeEnabled();
    await expect(page.getByText("Stopped. Start again when you are ready.", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Difficulty", exact: true }).selectOption("groove");
    await expect(page.getByRole("button", { name: "Kick Space", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Search/ }).first().click();
    await page.getByRole("searchbox", { name: /Search pages/ }).fill("ear training");
    await expect(page.getByRole("link", { name: /Ear Training/ }).last()).toBeVisible();
  });

  test("accepts keyboard and pad answers, isolates learner history, and fits the viewport", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("drum-hero:ear-training:v1", JSON.stringify({ version: 1, results: [{ id: "other", playedAt: "2026-10-22T12:00:00Z", level: "pulse", mode: "play", score: 100, replays: 0, assisted: false }] }));
      localStorage.setItem("drum-hero:learner-profiles:v1", JSON.stringify([{ id: "ear-test", name: "Ear learner", createdAt: "2026-10-22T12:00:00Z" }]));
      localStorage.setItem("drum-hero:active-learner:v1", "ear-test");
    });
    await page.goto("/ear-training");
    await expect(page.getByText("0 saved attempts on this learner profile", { exact: true })).toBeVisible();
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play my answer", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Play my answer", exact: true }).click();
    await expect(page.getByText("Your turn — play one bar from memory.", { exact: true })).toBeVisible();
    await page.keyboard.press("f");
    await page.getByRole("button", { name: "Snare F", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your rhythm recap", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByText("Hit timing details", { exact: true }).click();
    const rows = page.getByRole("region", { name: "Ear training results", exact: true }).getByRole("listitem");
    expect(await rows.filter({ hasNotText: "Missed" }).count()).toBe(2);
    const stored = await page.evaluate(() => ({ other: JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results, learner: JSON.parse(localStorage.getItem("drum-hero:ear-training:v1:profile:ear-test")!).results }));
    expect(stored.other).toHaveLength(1);
    expect(stored.other[0].id).toBe("other");
    expect(stored.learner).toHaveLength(1);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("ear-training-results.png"), fullPage: true });
  });

  test("audio loading errors allow retry without recording an attempt", async ({ page }) => {
    await page.route("**/audio/drums/**", route => route.abort());
    await page.goto("/ear-training");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByText("Drum sounds could not load. Check your audio connection and try Listen again.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Listen to rhythm", exact: true })).toBeEnabled();
    await expect(page.getByText("0 saved attempts on this learner profile", { exact: true })).toBeVisible();
  });

  test("supports meter and feel listening rounds with a configurable count-in", async ({ page }) => {
    await page.goto("/ear-training");
    const trainer = page.getByRole("region", { name: "Rhythm ear training", exact: true });
    await trainer.getByRole("combobox", { name: "Meter", exact: true }).selectOption("6/8");
    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("meter");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "6/8", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "6/8", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Correct rhythm!|Listen for the difference/ })).toBeVisible();
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results);
    expect(stored.at(-1)).toMatchObject({ mode: "meter" });
    expect(["4/4", "3/4", "6/8"]).toContain(stored.at(-1).meter);
    expect(stored.at(-1).score).toBe(stored.at(-1).meter === "6/8" ? 100 : 0);

    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("feel");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "shuffle", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "shuffle", exact: true }).click();
    await expect(page.getByText(/The groove is (straight|swing|shuffle)\./)).toBeVisible();
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results);
    expect(stored.at(-1)).toMatchObject({ mode: "feel" });
    expect(["straight", "swing", "shuffle"]).toContain(stored.at(-1).feel);
    expect(stored.at(-1).score).toBe(stored.at(-1).feel === "shuffle" ? 100 : 0);
  });

  test("supports longer tap-back phrases and stores separate placement and timing scores", async ({ page }) => {
    await page.goto("/ear-training");
    const trainer = page.getByRole("region", { name: "Rhythm ear training", exact: true });
    await trainer.getByRole("combobox", { name: "Meter", exact: true }).selectOption("3/4");
    await page.getByRole("combobox", { name: "Phrase length", exact: true }).selectOption("2");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play my answer", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Play my answer", exact: true }).click();
    await expect(page.getByText("Your turn — play two bars from memory.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your rhythm recap", exact: true })).toBeVisible({ timeout: 15000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results.at(-1));
    expect(saved).toMatchObject({ bars: 2, meter: "3/4", mode: "play", score: 0 });
    await expect(page.getByText(/Rhythm placement: 0% · Timing: 0%/)).toBeVisible();
  });

  test("saves daily plan progress across reloads", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("button", { name: "Start focused session", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Practice plan progress" })).toHaveAttribute("value", "0");
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Practice plan progress" })).toHaveAttribute("value", "0");
    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("identify");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Choose A", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Choose A", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Practice plan progress" })).toHaveAttribute("value", "1");
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Practice plan progress" })).toHaveAttribute("value", "1");
  });

  test("recall challenge removes the count-in and limits replays", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Recall support", exact: true }).selectOption("challenge");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByText("Listen: a 1-bar phrase. Remember the rhythm.", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Play my answer", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Listen again", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Play my answer", exact: true }).click();
    await expect(page.locator('strong[aria-label="Count-in"]')).toHaveCount(0);
  });

  test("rhythm builder compares a learner-created grid with the hidden example", async ({ page }) => {
    await page.goto("/ear-training");
    const builder = page.getByRole("region", { name: "Rhythm builder", exact: true });
    await builder.getByRole("button", { name: "Create example", exact: true }).click();
    await expect(builder.getByRole("button", { name: "Hear example", exact: true })).toBeEnabled();
    await builder.getByRole("button", { name: /Kick · Step 1/ }).click();
    await builder.getByRole("button", { name: "Compare rhythms", exact: true }).click();
    await expect(builder.getByText(/Rhythm match: \d+%/)).toBeVisible();
    await expect(builder.getByRole("group", { name: "Target example", exact: true })).toBeVisible();
    await expect(builder.getByRole("group", { name: "Your built rhythm", exact: true })).toBeVisible();
  });

  test("custom sessions expose selected duration and weak-skill focus", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Session length", exact: true }).selectOption("3");
    await page.getByRole("combobox", { name: "Focus skill", exact: true }).selectOption("rests");
    await page.getByRole("button", { name: "Start focused session", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Practice plan progress" })).toHaveAttribute("max", "3");
    await expect(page.getByText("Session progress: 0 of 3 drills", { exact: false })).toBeVisible();
    const meter = page.getByRole("region", { name: "Rhythm ear training", exact: true }).getByRole("combobox", { name: "Meter", exact: true });
    await meter.selectOption("5/4");
    await meter.selectOption("7/8");
  });

  test("microphone denial gives a recovery path and does not save an attempt", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } } });
    });
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Answer input", exact: true }).selectOption("microphone");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await page.getByRole("button", { name: "Start microphone answer", exact: true }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "Start microphone answer", exact: true }).click();
    await expect(page.getByText("Microphone access failed. Allow microphone access or switch back to drum pads.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1") ?? '{"results":[]}').results)).toHaveLength(0);
  });

  test("dictation hides the target until a multi-voice grid is submitted", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("dictation");
    await page.getByRole("combobox", { name: "Difficulty", exact: true }).selectOption("groove");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Write what you heard", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("group", { name: "Target rhythm", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Check transcription", exact: true }).click();
    await expect(page.getByRole("group", { name: "Target rhythm", exact: true })).toBeVisible();
    const saved = await page.evaluate(() => ({ history: JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results.at(-1), reviews: JSON.parse(localStorage.getItem("drum-hero:ear-training-review:v1")!) }));
    expect(saved.history).toMatchObject({ mode: "dictation", score: 0, assisted: false });
    expect(saved.reviews).toEqual(expect.arrayContaining([expect.objectContaining({ skill: "voice-separation" })]));
  });

  test("error detection compares two phrases and records a focused skill result", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: <T extends ArrayBufferView>(array: T) => { new Uint32Array(array.buffer, array.byteOffset, Math.floor(array.byteLength / Uint32Array.BYTES_PER_ELEMENT))[0] = 2; return array; } }));
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("error");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Same rhythm", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "A hit moved", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "A hit moved", exact: true }).click();
    await expect(page.getByRole("group", { name: "Which step did the moved hit land on?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Step 1", exact: true }).click();
    await expect(page.getByText(/Your choice: Different · Answer: Different/)).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results.at(-1));
    expect(saved).toMatchObject({ mode: "error", skills: ["error-detection"] });
    expect([50, 100]).toContain(saved.score);
  });

  test("voice isolation echoes a single voice and the pulse dropout saves a separate score", async ({ page }) => {
    await page.goto("/ear-training");
    await page.getByRole("combobox", { name: "Exercise", exact: true }).selectOption("voice");
    await expect(page.getByRole("combobox", { name: "Difficulty", exact: true })).toHaveValue("groove");
    await page.getByRole("combobox", { name: "Count-in", exact: true }).selectOption("0");
    await page.getByRole("slider", { name: "Tempo", exact: true }).fill("140");
    await page.getByRole("button", { name: "Listen to rhythm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play isolated voice back", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Play isolated voice back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your rhythm recap", exact: true })).toBeVisible({ timeout: 15000 });
    let history = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results);
    expect(history.at(-1)).toMatchObject({ mode: "voice", skills: expect.arrayContaining(["voice-separation"]) });
    expect(["kick", "snare", "hihat"]).toContain(history.at(-1).voice);

    await page.getByRole("button", { name: "Next rhythm", exact: true }).click();
    await page.getByRole("button", { name: "Start four-bar challenge", exact: true }).click();
    await expect(page.getByText(/Bar 1: click · Bars 2–3: silent · Bar 4: click returns/)).toBeVisible();
    await expect(page.getByText(/Pulse score: \d+%/)).toBeVisible({ timeout: 15000 });
    history = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:ear-training:v1")!).results);
    expect(history.at(-1)).toMatchObject({ mode: "dropout", level: "pulse", bars: 4, score: 0, skills: ["pulse-stability"] });
    await expect(page.getByRole("region", { name: "Curated groove lessons" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete the previous lesson" }).first()).toBeDisabled();
  });

  test("groove lessons unlock in order and due skills offer a one-click review", async ({ page }) => {
    await page.addInitScript(() => {
      const base = { playedAt: "2026-10-20T12:00:00.000Z", level: "groove", mode: "play", score: 90, replays: 0, assisted: false, skills: ["voice-separation"], meter: "4/4", feel: "straight", bars: 1, style: "rock", focus: "voice-separation", complexity: 1, lessonId: "backbeat" };
      localStorage.setItem("drum-hero:ear-training:v1", JSON.stringify({ version: 1, results: [{ ...base, id: "lesson-pass-1" }, { ...base, id: "lesson-pass-2" }] }));
      localStorage.setItem("drum-hero:ear-training-review:v1", JSON.stringify([{ skill: "pulse-stability", dueAt: "2020-01-01T00:00:00.000Z", intervalDays: 1, streak: 0, lastScore: 40 }]));
    });
    await page.goto("/ear-training");
    const lessons = page.getByRole("region", { name: "Curated groove lessons", exact: true });
    await expect(lessons.getByRole("button", { name: "Start lesson", exact: true })).toBeEnabled();
    await expect(lessons.getByRole("button", { name: "Complete the previous lesson", exact: true }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Review pulse challenge", exact: true })).toBeVisible();
    await lessons.getByRole("button", { name: "Start lesson", exact: true }).click();
    await expect(page.getByRole("region", { name: "Rhythm ear training", exact: true }).getByText(/2 · Half-time pocket/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Difficulty", exact: true })).toHaveValue("groove");
  });
});
