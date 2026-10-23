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
    await page.getByRole("button", { name: "Listen again", exact: true }).click();
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
    await page.getByRole("combobox", { name: "Meter", exact: true }).selectOption("6/8");
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
    await page.getByRole("combobox", { name: "Meter", exact: true }).selectOption("3/4");
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
    await page.getByRole("button", { name: "Start five-drill plan", exact: true }).click();
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
});
