import { test, expect } from "@playwright/test";

test("create a song, edit a drum part, and open practice", async ({ page }) => {
  await page.goto("/song-library");
  await expect(page.getByRole("heading", { name: "Find a song" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A New Beat");
  await page.getByLabel("Artist", { exact: true }).fill("Local Drummer");
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page.getByRole("heading", { name: "A New Beat" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Verse"));
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Add part" }).click();
  await page.getByRole("button", { name: "kick step 1" }).click();
  await expect(page.getByRole("button", { name: "kick step 1" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Practice section" }).click();
  await expect(page.getByRole("heading", { name: /A New Beat/ })).toBeVisible();
});

test("library persists across reload", async ({ page }) => {
  await page.goto("/song-library");
  await page.getByLabel("Title", { exact: true }).fill("Saved Song");
  await page.getByLabel("Artist", { exact: true }).fill("Drummer");
  await page.getByRole("button", { name: "Add song" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /Saved Song/ })).toBeVisible();
});

test("review and merge a library backup", async ({ page }) => {
  await page.goto("/song-library");
  const song = { id: "imported-1", title: "Backup Beat", artist: "Test Artist", difficulty: "Beginner", bpm: 90, meter: "4/4", tags: [], notes: "", sections: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  const backup = { version: 1, songs: [song], collections: [], favorites: [], progress: [], queues: [], setlists: [], journals: [], notes: [], schedules: [], recordings: [], reviews: [], tempoRamps: [], checklists: [], snapshots: [], roles: [] };
  await page.getByText("Merge library backup").click();
  await page.getByLabel("Library backup JSON").fill(JSON.stringify(backup));
  await page.getByRole("button", { name: "Merge backup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review library backup" })).toBeVisible();
  await page.getByRole("button", { name: "Merge records" }).click();
  await expect(page.getByRole("button", { name: /Backup Beat/ })).toBeVisible();
});
