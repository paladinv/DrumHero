import { test, expect } from "@playwright/test";

test("create a song, edit a drum part, and open practice", async ({ page }) => {
  await page.goto("/song-library");
  await expect(page.getByRole("heading", { name: "Find a song" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A New Beat");
  await page.getByLabel("Artist", { exact: true }).fill("Local Drummer");
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page.getByRole("heading", { name: "A New Beat" })).toBeVisible();
  await page.getByRole("tab", { name: "Arrangement", exact: true }).click();
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
  await page.getByText("Backup and account sync", { exact: true }).click();
  await page.getByText("Merge library backup", { exact: true }).click();
  await page.getByLabel("Library backup JSON").fill(JSON.stringify(backup));
  await page.getByRole("button", { name: "Merge backup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review library backup" })).toBeVisible();
  await page.getByRole("button", { name: "Merge records" }).click();
  await expect(page.getByRole("button", { name: /Backup Beat/ })).toBeVisible();
});

test("imports a Song Builder file and can undo a library edit", async ({ page }) => {
  await page.goto("/song-library");
  const project = { format: "drum-hero-song", version: 1, song: { id: "project-song", title: "Imported Project", artist: "Composer", difficulty: "Beginner", bpm: 100, meter: "4/4", tags: [], notes: "Project notes", sections: [] } };
  await page.getByLabel("Song file", { exact: true }).setInputFiles({ name: "project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await page.getByRole("button", { name: "Save reviewed song" }).click();
  await expect(page.getByRole("heading", { name: "Imported Project" })).toBeVisible();
  await page.getByRole("textbox", { name: "Practice notes", exact: true }).fill("An edited note");
  await expect(page.getByText("All changes saved on this device.")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Practice notes", exact: true })).toHaveValue("An edited note");
});

test("full song practice records tempo and part evidence", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("drum-hero:song-library:v1", JSON.stringify({ version: 1, songs: [{ id: "fast-song", title: "A Full Song", artist: "Composer", difficulty: "Beginner", bpm: 200, meter: "4/4", tags: [], notes: "", sections: [{ id: "verse", name: "Verse", kind: "verse", notes: "", bpm: 200, parts: [{ id: "kick", name: "Kick part", bpm: 200, beats: 4, subdivision: 4, hits: [{ step: 0, instrument: "kick" }] }] }] }] })); });
  await page.goto("/song-library");
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start four-count" }).click();
  await expect(page.getByText(/average part score/)).toBeVisible({ timeout: 12000 });
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:song-library:v1")!).progress[0].attempts[0]);
  expect(result).toMatchObject({ partId: "kick", bpm: 200, engine: "song" });
});

test("guided queue resumes its current item after reload", async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem("drum-hero:song-library:v1")) localStorage.setItem("drum-hero:song-library:v1", JSON.stringify({ version: 1, songs: [], queues: [{ id: "session", name: "Evening session", songIds: ["example-steady-road", "example-open-sky"] }] })); });
  await page.goto("/song-library");
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start queue", exact: true }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText(/2 \/ 2 · Next: Finish/)).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Resume queue", exact: true }).click();
  await expect(page.getByText(/2 \/ 2 · Next: Finish/)).toBeVisible();
});

test("storage failure retains the edit in memory and exposes backup recovery", async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === "drum-hero:song-library:v1") throw new DOMException("Quota reached", "QuotaExceededError"); return original.call(this, key, value); }; });
  await page.goto("/song-library");
  await page.getByLabel("Title", { exact: true }).fill("Unsaved Song");
  await page.getByLabel("Artist", { exact: true }).fill("Drummer");
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page.getByRole("heading", { name: "Unsaved Song" })).toBeVisible();
  await expect(page.getByText(/Changes are in memory/)).toBeVisible();
  await page.getByText("Backup and account sync", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export library backup", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("drum-hero-library.json");
});

test("saved takes load audio with expected-hit waveform markers", async ({ page }) => {
  await page.goto("/song-library");
  await expect(page.getByRole("heading", { name: "Find a song" })).toBeVisible();
  await page.evaluate(async () => {
    const buffer = new ArrayBuffer(44 + 8000); const view = new DataView(buffer);
    const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    text(0, "RIFF"); view.setUint32(4, 8036, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, 8000, true);
    for (let sample = 0; sample < 4000; sample++) view.setInt16(44 + sample * 2, Math.sin(sample * .2) * 6000, true);
    await new Promise<void>((resolve, reject) => { const request = indexedDB.open("drum-hero-song-recordings", 1); request.onupgradeneeded = () => request.result.createObjectStore("takes"); request.onerror = () => reject(new Error(`Database failed: ${request.error?.name ?? "unknown"} ${request.error?.message ?? ""}`)); request.onsuccess = () => { const transaction = request.result.transaction("takes", "readwrite"); const put = transaction.objectStore("takes").put({ data: buffer, mimeType: "audio/wav" }, "wave-take"); put.onerror = () => reject(new Error(`Write failed: ${put.error?.name ?? "unknown"} ${put.error?.message ?? ""}`)); transaction.oncomplete = () => { request.result.close(); resolve(); }; transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.name ?? "unknown"} ${transaction.error?.message ?? ""}`)); transaction.onabort = () => reject(new Error(`Transaction aborted: ${transaction.error?.name ?? "unknown"} ${transaction.error?.message ?? ""}`)); }; });
    const state = JSON.parse(localStorage.getItem("drum-hero:song-library:v1") || '{"version":1}');
    state.recordings = [{ id: "wave-take", songId: "example-open-sky", sectionId: "verse", createdAt: "2026-10-19T00:00:00Z", durationMs: 500, mimeType: "audio/wav", hitCount: 2, timingConsistency: 100, onsetTimes: [.06, .26], expectedTimes: [.05, .25] }];
    localStorage.setItem("drum-hero:song-library:v1", JSON.stringify(state)); window.dispatchEvent(new Event("drum-hero:song-library-change"));
  });
  await page.getByRole("tab", { name: "Rehearsal", exact: true }).click();
  await page.getByText("Local recordings", { exact: true }).click();
  await page.getByRole("button", { name: "Load audio and waveform" }).click();
  await expect(page.getByRole("img", { name: "Recorded waveform with expected hit and detected onset markers" })).toBeVisible();
  await expect(page.getByLabel("Seek recording", { exact: true })).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("spinbutton",{name:"Recording alignment (ms)",exact:true}).fill("120");
  await page.getByRole("button",{name:"Save recording alignment",exact:true}).click();
  await page.reload();
  const offset=await page.evaluate(()=>JSON.parse(localStorage.getItem("drum-hero:song-library:v1")!).recordings[0].alignmentOffsetMs);
  expect(offset).toBe(120);
  await page.getByRole("tab",{name:"Rehearsal",exact:true}).click();
  await page.getByText("Local recordings",{exact:true}).click();
  await page.getByText("Trim recording silence",{exact:true}).click();
  await page.getByRole("spinbutton",{name:"Trim start (seconds)",exact:true}).fill("0.1");
  await page.getByRole("spinbutton",{name:"Trim end (seconds)",exact:true}).fill("0.4");
  await page.getByRole("button",{name:"Save trimmed audio copy",exact:true}).click();
  await expect(page.getByText("· Trimmed copy",{exact:true})).toBeVisible();
  const trimmed=await page.evaluate(()=>JSON.parse(localStorage.getItem("drum-hero:song-library:v1")!).recordings.find((take:{trimmedFrom?:string})=>take.trimmedFrom==="wave-take"));
  expect(trimmed).toMatchObject({durationMs:300,mimeType:"audio/wav",timingConsistency:null});
});
