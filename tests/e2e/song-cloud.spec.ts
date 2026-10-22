import { test, expect } from "@playwright/test";

// Run against a build with the documented mock URL and a non-secret test key.
// This exercises client conflict handling; it does not replace live RLS checks.
test("reviews a concurrent cloud revision before retrying a save", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_CLOUD_MOCK !== "1", "Requires the isolated mock-account build");
  const accountId = "11111111-1111-4111-8111-111111111111";
  const libraryId = "22222222-2222-4222-8222-222222222222";
  const song = { id: "shared-song", title: "Shared Song", artist: "Drummer", difficulty: "Beginner", bpm: 96, meter: "4/4", tags: [], notes: "", sections: [], createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" };
  const state = { version: 1, songs: [song], recordings: [{ id: "local-take", songId: song.id, createdAt: "2026-10-19T00:00:00Z", durationMs: 500, mimeType: "audio/wav", hitCount: 1, timingConsistency: null }] };
  await page.addInitScript((value) => localStorage.setItem("drum-hero:song-library:v1", JSON.stringify(value)), state);
  let row = { id: libraryId, name: "Shared repertoire", owner_id: accountId, revision: 1, state: { ...state, recordings: [] }, updated_at: "2026-10-19T00:00:00Z" };
  let writes = 0;
  const user = { id: accountId, email: "drummer@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-19T00:00:00Z" };
  await page.route("https://drum-library-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/token") return respond({ access_token: "test-access-token", refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, user });
    if (url.pathname === "/auth/v1/user") return respond(user);
    if (url.pathname === "/rest/v1/rpc/drum_library_role") return respond("owner");
    if (url.pathname === "/rest/v1/drum_library_members") return respond([]);
    if (url.pathname === "/rest/v1/drum_library_revisions") return respond(url.searchParams.get("select")==="state"?{state:{...state,recordings:[]}}:[{revision:1,created_at:"2026-10-19T00:00:00Z",device_name:"Rehearsal laptop"}]);
    if (url.pathname === "/rest/v1/drum_libraries") return respond(url.searchParams.get("select") === "*" ? row : [{ id: libraryId, name: row.name, owner_id: accountId }]);
    if (url.pathname === "/rest/v1/rpc/save_drum_library") {
      const payload = route.request().postDataJSON();
      expect(payload.p_state.recordings).toEqual([]);
      writes++;
      if (writes === 1) {
        expect(payload.p_revision).toBe(1);
        row = { ...row, revision: 2, state: { ...row.state, songs: [{ ...song, title: "Cloud edit" }] } };
        return respond({ code: "40001", message: "Revision conflict" }, 409);
      }
      expect(payload.p_revision).toBe(writes===2?2:3);
      expect(payload.p_state.songs[0].title).toBe(writes===2?"Device edit":"Shared Song");
      expect(payload.p_device_name).toBe("This device");
      row = { ...row, revision: writes===2?3:4, state: payload.p_state };
      return respond(row);
    }
    throw new Error(`Unexpected mock service request: ${url.pathname}`);
  });
  await page.goto("/song-library");
  await page.getByRole("button", { name: /^Shared Song Drummer/ }).click();
  await page.getByText("Backup and account sync", { exact: true }).click();
  await page.getByRole("button", { name: "Connect account", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("drummer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("combobox", { name: "Cloud library", exact: true }).selectOption(libraryId);
  await page.getByRole("button", { name: "Review cloud library", exact: true }).click();
  await page.getByRole("button", { name: "Keep device version and sync", exact: true }).click();
  await page.context().setOffline(true);
  await expect(page.getByText(/Signed in as.*Offline/)).toBeVisible();
  await page.getByText("Backup and account sync", { exact: true }).click();
  await page.getByLabel("Song title", { exact: true }).fill("Device edit");
  await page.getByLabel("Artist name", { exact: true }).focus();
  await page.getByText("Backup and account sync", { exact: true }).click();
  await expect(page.getByText(/Revision 1.*Local changes pending/)).toBeVisible();
  expect(writes).toBe(0);
  await page.context().setOffline(false);
  await expect(page.getByText("The cloud library changed. Review conflicts before syncing again.")).toBeVisible();
  await page.getByRole("combobox", { name: "Device edit", exact: true }).selectOption("device");
  await page.getByRole("button", { name: "Merge reviewed changes", exact: true }).click();
  await expect(page.getByText("Synced revision 3.")).toBeVisible();
  expect(writes).toBe(2);
  await page.getByText("Device activity and recoverable revisions",{exact:true}).click();
  await page.getByRole("button",{name:"Refresh revision history",exact:true}).click();
  await expect(page.getByText(/Rehearsal laptop/)).toBeVisible();
  await page.getByRole("button",{name:"Review revision 1 for recovery",exact:true}).click();
  await expect(page.getByText(/Review recovery of revision 1/)).toBeVisible();
  await page.getByRole("button",{name:"Use cloud version",exact:true}).click();
  await expect(page.getByText("Synced revision 4.")).toBeVisible();
  expect(writes).toBe(3);
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem("drum-hero:song-library:v1")!));
  expect(local.recordings[0].id).toBe("local-take");
});
