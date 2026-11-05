import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function configure(page: Page, mode = 'trading', input = 'keyboard') {
  await page.goto('/improvisation');
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption(mode);
  await page.getByRole('slider', { name: /Tempo/ }).fill('200');
  await page.getByRole('combobox', { name: mode === 'trading' ? 'Exchanges' : 'Four-bar phrases', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: 'Input', exact: true }).selectOption(input);
}
async function begin(page: Page) {
  await page.clock.install();
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
  await page.clock.fastForward(1400);
}
async function saved(page: Page, profile = '') {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"sessions":[]}').sessions, `drum-hero:improvisation:v1${profile ? `:profile:${profile}` : ''}`);
}

test.describe('improvisation', () => {
  test('quick starts, phrase preview, score reveal, and mobile score stay usable', async ({ page }) => {
    await page.goto('/improvisation');
    await page.getByRole('button', { name: 'Steady backbeat', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Musical prompt', exact: true })).toHaveValue('backbeat');
    await page.getByLabel(/Live score reveal/).selectOption('live');
    await page.getByText('Groove and subdivision builder', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Hi-hat subdivision', exact: true }).selectOption('sixteenth');
    const preview = page.locator('details').filter({ has: page.getByText('Preview this setup', { exact: true }) });
    await page.getByText('Preview this setup', { exact: true }).click();
    await expect(preview.getByRole('region', { name: 'Scrollable drum score', exact: true })).toBeVisible();
    await expect(preview.locator('.trainer-notation-beam line').first()).toHaveCount(1);
    await preview.getByRole('button', { name: 'Play phrase preview', exact: true }).click();
    await expect(preview.getByRole('status')).toContainText('Phrase preview is playing.');
    await preview.getByRole('button', { name: 'Stop preview', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('input timing calibration saves only the correction in the learner profile', async ({ page }) => {
    await page.clock.install();
    await page.goto('/improvisation');
    await page.getByText('Pre-session sound and input check', { exact: true }).click();
    await page.getByRole('button', { name: 'Calibrate input timing', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Follow the eight clicks' })).toBeVisible();
    for (let beat = 0; beat < 8; beat++) {
      await page.clock.fastForward(beat === 0 ? 1000 : 750);
      await page.keyboard.press('f');
    }
    await page.clock.fastForward(900);
    const preflight = page.locator('details').filter({ has: page.getByText('Pre-session sound and input check', { exact: true }) });
    await expect(preflight.getByRole('status').last()).toContainText('Timing correction saved:');
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('drum-hero:trainer:v1') ?? '{}').deviceProfiles.keyboard);
    expect(profile.latencyCalibrated).toBe(true);
    expect(profile.latencySpreadMs).toBeGreaterThanOrEqual(0);
    expect(profile.latencySpreadMs).toBeLessThanOrEqual(240);
  });

  test('trades fours, captures only player hits, saves and repeats independently of mastery', async ({ page }) => {
    await configure(page);
    await begin(page);
    await expect(page.getByRole('heading', { name: 'Virtual drummer', exact: true })).toBeVisible();
    await page.keyboard.press('f');
    await expect(page.getByText('Captured player hits: 0', { exact: true })).toBeVisible();
    await page.clock.fastForward(4800);
    await expect(page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
    await page.keyboard.press('f');
    await page.getByRole('button', { name: 'Kick Space', exact: true }).click();
    await expect(page.getByText('Captured player hits: 2', { exact: true })).toBeVisible();
    await page.clock.fastForward(14000);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeFocused();
    const sessions = await saved(page);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].phrases.map((p: { hitCount: number }) => p.hitCount)).toEqual([2, 0]);
    expect(sessions[0]).not.toHaveProperty('hits');
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('drum-hero:progress:v1') ?? '{}'));
    expect(progress.sessions ?? []).toHaveLength(0);
    await page.getByRole('button', { name: 'Repeat session', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    expect(await saved(page)).toHaveLength(1);
  });

  test('guided touch playing changes prompts and reports silence without timing evidence', async ({ page }, testInfo) => {
    await configure(page, 'guided', 'touch');
    await page.getByRole('combobox', { name: 'Musical prompt', exact: true }).selectOption('backbeat');
    await page.getByRole('checkbox', { name: 'Change prompt every four bars', exact: true }).check();
    await begin(page);
    await expect(page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Snare F', exact: true }).click();
    await expect(page.getByText('Captured player hits: 1', { exact: true })).toBeVisible();
    await page.clock.fastForward(4800);
    await expect(page.getByRole('region', { name: 'Live improvisation', exact: true }).getByText('Use only kick and snare', { exact: true })).toBeVisible();
    await page.clock.fastForward(4800);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    const sessions = await saved(page);
    expect(sessions[0].phrases[0].hitCount).toBe(1);
    expect(sessions[0].phrases[1]).toMatchObject({ timingDistanceMs: null, voiceCompliance: null });
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('improvisation-recap.png'), fullPage: true });
    await page.getByRole('region', { name: 'Live improvisation', exact: true }).screenshot({ path: testInfo.outputPath('improvisation-stage.png') });
    await page.getByRole('region', { name: 'Phrase replay', exact: true }).screenshot({ path: testInfo.outputPath('improvisation-replay.png') });

  });

  test('backgrounding pauses, resume counts in, and stop never saves partial sessions', async ({ page }) => {
    await configure(page, 'guided'); await begin(page);
    await page.keyboard.press('f');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
    await page.clock.fastForward(60000);
    expect(await saved(page)).toHaveLength(0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('button', { name: 'Resume with count-in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
    await page.clock.fastForward(1400);
    await expect(page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.clock.fastForward(60000);
    expect(await saved(page)).toHaveLength(0);
    await expect(page.getByText('Stopped. Incomplete sessions are not saved.', { exact: true })).toBeVisible();
  });

  test('unscored acoustic practice supports ratings, profile isolation and deletion', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('drum-hero:learner-profiles:v1', JSON.stringify([{ id: 'improv-test', name: 'Improv learner', createdAt: '2026-10-22T12:00:00Z' }]));
      localStorage.setItem('drum-hero:active-learner:v1', 'improv-test');
    });
    await configure(page, 'guided', 'unscored'); await begin(page);
    await page.clock.fastForward(10000);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    await expect(page.getByText('Completed · unscored practice', { exact: true })).toHaveCount(2);
    await page.getByRole('combobox', { name: 'How did it feel?', exact: true }).selectOption('comfortable');
    expect((await saved(page, 'improv-test'))[0]).toMatchObject({ input: 'unscored', selfRating: 'comfortable' });
    expect(await saved(page)).toHaveLength(0);
    await page.getByRole('button', { name: /Delete session/ }).click();
    expect(await saved(page, 'improv-test')).toHaveLength(0);
  });

  test('MIDI maps, note-off filtering, disconnect pause and explicit input switching', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('drum-hero:trainer:v1', JSON.stringify({ version: 2, rounds: [], deviceProfiles: { 'midi:test-kit': { latencyMs: 20, midiMap: { 60: 'snare' } } } }));
      const input = { id: 'test-kit', name: 'Test kit', state: 'connected', onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null };
      const access = { inputs: new Map([['test-kit', input]]), onstatechange: null as ((event: { port: { id: string; type: string; state: string } }) => void) | null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
      Object.assign(window, {
        improvMidiHit: (status: number, velocity: number) => input.onmidimessage?.({ data: new Uint8Array([status, 60, velocity]), timeStamp: performance.now() }),
        disconnectImprovMidi: () => { input.state = 'disconnected'; access.onstatechange?.({ port: { id: input.id, type: 'input', state: 'disconnected' } }); }
      });
    });
    await configure(page, 'guided', 'midi');
    await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'MIDI input', exact: true })).toHaveValue('test-kit');
    await begin(page);
    await page.evaluate(() => { const w = window as unknown as { improvMidiHit: (status: number, velocity: number) => void }; w.improvMidiHit(0x99, 90); w.improvMidiHit(0x89, 90); w.improvMidiHit(0x99, 0); });
    await expect(page.getByText('Captured player hits: 1', { exact: true })).toBeVisible();
    await page.evaluate(() => (window as unknown as { disconnectImprovMidi: () => void }).disconnectImprovMidi());
    await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume with count-in', exact: true }).click();
    await expect(page.getByText('Reconnect MIDI or choose another input before resuming.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Input', exact: true }).selectOption('keyboard');
    await page.getByRole('button', { name: 'Resume with count-in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
    await page.clock.fastForward(1400); await page.keyboard.press('f');
    await expect(page.getByText('Captured player hits: 2', { exact: true })).toBeVisible();
  });

  test('full backup export and restore carries improvisation history', async ({ page }) => {
    await configure(page, 'guided', 'unscored'); await begin(page); await page.clock.fastForward(10000);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    const original = await saved(page);
    await page.goto('/progress');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download full backup', exact: true }).click();
    const download = await downloadPromise;
    const contents = await readFile((await download.path())!, 'utf8');
    expect(JSON.parse(JSON.parse(contents).localStorage['drum-hero:improvisation:v1']).sessions).toEqual(original);
    await page.evaluate(() => localStorage.removeItem('drum-hero:improvisation:v1'));
    await page.getByLabel('Choose a Drum Hero backup file', { exact: true }).setInputFiles({ name: 'improv-backup.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Restore improv-backup.json', exact: true }).click()]);
    await page.goto('/improvisation');
    await expect(page.getByText('1 saved sessions on this learner profile', { exact: true })).toBeVisible();
    expect(await saved(page)).toEqual(original);
  });

  test('audio load failure and cancellation remain recoverable', async ({ page }) => {
    await page.route('**/audio/drums/**', route => route.abort());
    await configure(page);
    await page.getByRole('button', { name: 'Start session', exact: true }).click();
    await expect(page.getByText('Drum sounds could not load. Check your audio connection and try again.', { exact: true })).toBeVisible();
    expect(await saved(page)).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeEnabled();
  });
});

test('ignores typing and repeated keys and cancels scheduled audio on pause and navigation', async ({ page }) => {
  await page.addInitScript(() => {
    type TrackedSource = { node: AudioScheduledSourceNode; stopAt: number };
    const sources: TrackedSource[] = [];
    for (const prototype of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
      const originalStart = prototype.start, originalStop = prototype.stop;
      prototype.start = function(this: AudioScheduledSourceNode, ...args: Parameters<AudioScheduledSourceNode['start']>) {
        const tracked = { node: this, stopAt: Infinity }; sources.push(tracked);
        this.addEventListener('ended', () => { tracked.stopAt = this.context.currentTime; }, { once: true });
        return originalStart.apply(this as AudioBufferSourceNode & OscillatorNode, args);
      };
      prototype.stop = function(this: AudioScheduledSourceNode, when?: number) {
        const source = sources.find(entry => entry.node === this);
        if (source) source.stopAt = when ?? this.context.currentTime;
        return originalStop.call(this as AudioBufferSourceNode & OscillatorNode, when);
      };
    }
    Object.assign(window, { pendingImprovAudio: () => sources.filter(source => source.stopAt > source.node.context.currentTime).length });
  });
  await configure(page, 'guided'); await begin(page);
  await page.locator('body').evaluate(element => { const input = document.createElement('input'); input.setAttribute('aria-label', 'Typing test'); element.append(input); });
  await page.getByLabel('Typing test', { exact: true }).fill('f');
  await page.getByLabel('Typing test', { exact: true }).press('f');
  await expect(page.getByText('Captured player hits: 0', { exact: true })).toBeVisible();
  await page.getByLabel('Typing test', { exact: true }).evaluate(element => element.remove());
  await page.keyboard.down('f'); await page.keyboard.down('f'); await page.keyboard.up('f');
  await expect(page.getByText('Captured player hits: 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { pendingImprovAudio: () => number }).pendingImprovAudio())).toBe(0);
  await page.getByRole('button', { name: 'Resume with count-in', exact: true }).click();
  await page.clock.fastForward(1400);
  await page.getByRole('link', { name: 'Calibrate input in Trainer', exact: true }).click();
  await expect(page).toHaveURL(/\/trainer\?setup=1/);
  expect(await page.evaluate(() => (window as unknown as { pendingImprovAudio: () => number }).pendingImprovAudio())).toBe(0);
});


test('saved dark and high-contrast settings keep improvisation accessible', async ({ page }) => {
  await page.goto('/improvisation');
  await page.evaluate(() => {
    document.cookie = 'drumHeroTheme=dark; Path=/; SameSite=Lax';
    localStorage.setItem('drum-hero:accessibility:v1', JSON.stringify({ contrast: true, motion: true, spacing: false, scale: 1 }));
  });
  await configure(page, 'guided', 'unscored');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  await begin(page); await page.clock.fastForward(10000);
  await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
});

test.describe('extended improvisation tools', () => {
  async function shortGuided(page: Page) {
    await configure(page, 'guided');
    await page.getByRole('combobox', { name: 'Bars per turn', exact: true }).selectOption('2');
    await page.getByRole('combobox', { name: 'Player phrases', exact: true }).selectOption('1');
  }
  test('replays, slows down, optionally saves a response and retains notes and presets', async ({ page }) => {
    await shortGuided(page); await begin(page);
    await page.keyboard.press('f');
    await page.clock.fastForward(2500);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('drum-hero:improvisation-takes:v1'))).toBeNull();
    await page.getByRole('textbox', { name: 'Session notes', exact: true }).fill('Try more space next time.');
    await page.getByRole('textbox', { name: 'Reflection for phrase 1', exact: true }).fill('I kept the original rhythm.');
    await page.getByRole('combobox', { name: 'Replay speed', exact: true }).selectOption('0.5');
    await page.getByRole('button', { name: 'Compare phrases', exact: true }).click();
    await expect(page.getByText(/Replay uses synthesized drum sounds/)).toBeVisible();
    await page.clock.fastForward(12000);
    await expect(page.getByText('Replay complete.', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Take name', exact: true }).fill('My first answer');
    await page.getByRole('button', { name: 'Save this take', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Take saved', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Short ideas');
    await page.getByRole('button', { name: 'Save practice preset', exact: true }).click();
    await page.goto('/progress');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download full backup', exact: true }).click();
    const backup = await downloaded;
    const contents = await readFile((await backup.path())!, 'utf8');
    const storage = JSON.parse(contents).localStorage;
    expect(JSON.parse(storage['drum-hero:improvisation-takes:v1']).takes[0].name).toBe('My first answer');
    expect(JSON.parse(storage['drum-hero:improvisation-workspace:v1']).presets[0].name).toBe('Short ideas');
    await page.evaluate(() => { localStorage.removeItem('drum-hero:improvisation-takes:v1'); localStorage.removeItem('drum-hero:improvisation-workspace:v1'); });
    await page.getByLabel('Choose a Drum Hero backup file', { exact: true }).setInputFiles({ name: 'improv-tools.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Restore improv-tools.json', exact: true }).click()]);
    await page.goto('/improvisation');
    await expect(page.getByRole('button', { name: 'Review take My first answer', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review take My first answer', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play response', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Load preset Short ideas', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Bars per turn', exact: true })).toHaveValue('2');
    const entries = await saved(page);
    expect(entries[0].notes).toBe('Try more space next time.');
    expect(entries[0].phrases[0].reflection).toBe('I kept the original rhythm.');
    await page.getByRole('button', { name: 'Delete take My first answer', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review take My first answer', exact: true })).toHaveCount(0);
  });

  test('finishes open-ended practice with complete phrases and excludes the unfinished response', async ({ page }) => {
    await shortGuided(page);
    await page.getByRole('checkbox', { name: 'Open-ended session', exact: true }).check();
    await begin(page); await page.keyboard.press('f');
    await page.clock.fastForward(2400); await page.keyboard.press('j');
    await page.getByRole('button', { name: 'Finish session', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    const entries = await saved(page);
    expect(entries).toHaveLength(1); expect(entries[0].settings.openEnded).toBe(true);
    expect(entries[0].phrases).toHaveLength(1); expect(entries[0].phrases[0].hitCount).toBe(1);
    await expect(page.getByRole('combobox', { name: 'Replay phrase', exact: true }).locator('option')).toHaveCount(1);
  });

  test('demonstrates a learning step, records participation and advances to space', async ({ page }) => {
    await page.goto('/improvisation');
    await page.getByRole('combobox', { name: 'Learning step', exact: true }).selectOption('0');
    await expect(page.getByRole('combobox', { name: 'Bars per turn', exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Show lesson example', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play demonstration', exact: true })).toBeEnabled();
    await page.getByRole('slider', { name: /Tempo/ }).fill('200');
    await begin(page); await page.clock.fastForward(10000);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Complete step and continue', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Learning step', exact: true })).toHaveValue('1');
    await expect(page.getByRole('combobox', { name: 'Musical prompt', exact: true })).toHaveValue('space');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('drum-hero:improvisation-workspace:v1')!).completedSteps)).toEqual(['pulse']);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Learning step', exact: true }).locator('option[value="0"]')).toContainText('Completed');
  });

  test('uses jazz timing, permits no required entry, and starts a slower focused retry', async ({ page }) => {
    await shortGuided(page);
    await page.getByRole('combobox', { name: 'Musical style', exact: true }).selectOption('jazz');
    await page.getByText('Drummer and handoff options', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Required entry', exact: true }).selectOption('none');
    await page.getByRole('combobox', { name: 'Musical prompt', exact: true }).selectOption('motif');
    await begin(page); await page.keyboard.press('f'); await page.clock.fastForward(2500);
    await page.getByText('Timing and constraint details', { exact: true }).click();
    await expect(page.getByText(/Mean distance from triplet grid:/)).toBeVisible();
    await expect(page.getByText('Chosen entry was not captured within the beat-1 window.', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Repeat phrase 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: /Tempo/ })).toHaveValue('160');
    await expect(page.getByRole('combobox', { name: 'Player phrases', exact: true })).toHaveValue('1');
  });

  test('keeps comparable progress separate from other setups and reopens a previous session', async ({ page }) => {
    await shortGuided(page); await begin(page); await page.keyboard.press('f'); await page.clock.fastForward(2500);
    await page.getByRole('button', { name: 'Repeat session', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
    await page.clock.fastForward(1400); await page.keyboard.press('f'); await page.clock.fastForward(2500);
    await expect(page.getByRole('table', { name: 'Comparable improvisation sessions', exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Comparable improvisation sessions', exact: true }).locator('tbody tr')).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Musical style', exact: true }).selectOption('funk');
    await page.getByRole('button', { name: 'Reopen session setup', exact: true }).first().click();
    await expect(page.getByRole('combobox', { name: 'Musical style', exact: true })).toHaveValue('rock');
  });

  test('announces handoffs once and keeps the notation playhead in sync', async ({ page }) => {
    await page.addInitScript(() => {
      const spoken: string[] = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: () => {}, speak: (utterance: { text: string }) => spoken.push(utterance.text) } });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { text: string; constructor(text: string) { this.text = text; } } });
      Object.assign(window, { improvisationSpoken: spoken });
    });
    await configure(page);
    await page.getByRole('combobox', { name: 'Bars per turn', exact: true }).selectOption('2');
    await page.getByText('Drummer and handoff options', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Spoken handoff cues', exact: true }).check();
    await begin(page);
    await expect(page.getByRole('region', { name: 'Scrollable drum score', exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Bar 1, beat 1/).first()).toBeVisible();
    await page.clock.fastForward(1200);
    await expect(page.getByText('Your turn in one bar', { exact: true })).toBeVisible();
    await page.clock.fastForward(1200);
    const spoken = await page.evaluate(() => (window as unknown as { improvisationSpoken: string[] }).improvisationSpoken);
    expect(spoken.filter(text => text === 'Your turn')).toHaveLength(1);
    expect(spoken).toContain('Your turn in one bar');
  });
});

test.describe('extended improvisation practice', () => {
  async function advanced(page: Page) {
    await page.getByText('Challenges and accompaniment', { exact: true }).click();
  }

  test('call and response reports explicit targets and a visual timing review', async ({ page }) => {
    await configure(page); await advanced(page);
    await page.getByRole('combobox', { name: 'Call-and-response challenge', exact: true }).selectOption('echo');
    await page.getByRole('textbox', { name: 'Practice intention', exact: true }).fill('Echo the opening clearly');
    await begin(page); await page.clock.fastForward(4800);
    await page.getByRole('button', { name: 'Kick Space', exact: true }).click();
    await page.clock.fastForward(14500);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    const sessions = await saved(page);
    expect(sessions[0].settings).toMatchObject({ challenge: 'echo', intention: 'Echo the opening clearly' });
    expect(sessions[0].phrases[0].challenge.total).toBe(16);
    expect(sessions[0].phrases[0].challenge.matched).toBeLessThan(16);
    await page.getByText('Visual timing review', { exact: true }).click();
    await expect(page.getByRole('table', { name: 'Captured hit timing', exact: true })).toBeVisible();
    await expect(page.getByText(/Missed required target/).first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Replay phrase', exact: true }).selectOption({ value: '1' });
    await expect(page.getByText('No timing evidence — no player hits were captured in this phrase.', { exact: true })).toBeVisible();
  });

  test('motif exercise carries one idea across four exchanges', async ({ page }) => {
    await configure(page); await advanced(page);
    await page.getByRole('combobox', { name: 'Bars per turn', exact: true }).selectOption('2');
    await page.getByRole('combobox', { name: 'Call-and-response challenge', exact: true }).selectOption('development');
    await expect(page.getByRole('combobox', { name: 'Exchanges', exact: true })).toHaveValue('4');
    await begin(page);
    await expect(page.getByText('Repeat the reference motif.', { exact: true })).toBeVisible();
    await page.clock.fastForward(4800);
    await expect(page.getByText('Keep its rhythm and move it to your answer drum.', { exact: true })).toBeVisible();
    await page.clock.fastForward(4800);
    await expect(page.getByText('Repeat its opening; change the final bar.', { exact: true })).toBeVisible();
    await page.clock.fastForward(4800);
    await expect(page.getByText('Choose your own closing phrase. Reflect on how the motif developed.', { exact: true })).toBeVisible();
    await page.clock.fastForward(5000);
    expect((await saved(page))[0].phrases.map((p: { challenge: { total: number } }) => p.challenge.total)).toEqual([8, 8, 4, 0]);
  });

  test('sound check previews pads and keyboard without capturing a practice session', async ({ page }) => {
    await configure(page);
    await page.getByText('Pre-session sound and input check', { exact: true }).click();
    await page.getByRole('button', { name: 'Start sound check', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Test Kick sound', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Test Kick sound', exact: true }).click();
    await expect(page.getByText('Received Kick · velocity — · saved correction 0 ms', { exact: true })).toBeVisible();
    await page.getByRole('heading', { name: 'Ready to improvise', exact: true }).click();
    await page.keyboard.press('f');
    await expect(page.getByText('Received Snare · velocity — · saved correction 0 ms', { exact: true })).toBeVisible();
    expect(await saved(page)).toHaveLength(0);
    await expect(page.getByText('Captured player hits: 0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'End sound check', exact: true }).click();
    await begin(page); await page.getByRole('button', { name: 'Stop', exact: true }).click();
  });

  test('performance view keeps transport and pads accessible and returns to recap', async ({ page }, testInfo) => {
    await configure(page, 'guided', 'touch');
    await page.getByRole('button', { name: 'Performance view', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Mode', exact: true })).toBeHidden();
    await page.clock.install();
    await page.getByRole('button', { name: 'Start practice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Count-in', exact: true })).toBeVisible();
    await page.clock.fastForward(1400);
    await page.getByRole('button', { name: 'Snare F', exact: true }).click();
    await page.getByRole('button', { name: 'Pause practice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume practice', exact: true }).click();
    await page.clock.fastForward(1400);
    await page.screenshot({ path: testInfo.outputPath('improvisation-performance.png'), fullPage: true });
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.clock.fastForward(12000);
    await expect(page.getByRole('heading', { name: 'Your improvisation recap', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Performance view', exact: true })).toBeVisible();
  });

  test('teacher sequences retain exact step participation and reflections after reload', async ({ page }) => {
    await configure(page, 'guided', 'unscored');
    await page.getByText('Create a practice assignment', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Assignment name', exact: true }).fill('Space study');
    await page.getByRole('textbox', { name: 'Step name', exact: true }).fill('Keep a pulse');
    await page.getByRole('button', { name: 'Append current setup', exact: true }).click();
    await page.getByRole('combobox', { name: 'Musical prompt', exact: true }).selectOption('space');
    await page.getByRole('textbox', { name: 'Step name', exact: true }).fill('Leave beat four');
    await page.getByRole('button', { name: 'Append current setup', exact: true }).click();
    await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
    await page.getByRole('button', { name: 'Load playlist step 1', exact: true }).click();
    await begin(page); await page.clock.fastForward(10000);
    await page.getByRole('textbox', { name: 'Reflection for phrase 1', exact: true }).fill('I kept the pulse');
    await page.getByRole('textbox', { name: 'Session notes', exact: true }).fill('Repeat with more space');
    expect((await saved(page))[0].assignment.stepId).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Space study', exact: true })).toBeVisible();
    await page.getByText('Review step results and reflections', { exact: true }).click();
    const region = page.getByRole('region', { name: 'Improvisation assignments', exact: true });
    await expect(region.getByText(/I kept the pulse/)).toBeVisible();
    await expect(region.getByText('Repeat with more space', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Load playlist step 2', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Musical prompt', exact: true })).toHaveValue('space');
    await page.evaluate(() => {
      localStorage.setItem('drum-hero:learner-profiles:v1', JSON.stringify([{ id: 'other-improv', name: 'Other learner', createdAt: '2026-10-24T12:00:00Z' }]));
      localStorage.setItem('drum-hero:active-learner:v1', 'other-improv');
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Space study', exact: true })).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem('drum-hero:active-learner:v1', 'default'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Space study', exact: true })).toBeVisible();
    await page.goto('/progress');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download full backup', exact: true }).click();
    const contents = await readFile((await (await downloadEvent).path())!, 'utf8');
    const workspace = JSON.parse(JSON.parse(contents).localStorage['drum-hero:improvisation-workspace:v1']);
    expect(workspace.assignments[0].steps).toHaveLength(2);
    await page.evaluate(() => localStorage.removeItem('drum-hero:improvisation-workspace:v1'));
    await page.getByLabel('Choose a Drum Hero backup file', { exact: true }).setInputFiles({ name: 'assignment-backup.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Restore assignment-backup.json', exact: true }).click()]);
    await page.goto('/improvisation');
    await expect(page.getByRole('heading', { name: 'Space study', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete playlist Space study', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Space study', exact: true })).toHaveCount(0);
  });

  test('suggestions require comparable evidence and apply only when chosen', async ({ page }) => {
    await configure(page, 'guided'); await begin(page);
    await page.getByRole('button', { name: 'Kick Space', exact: true }).click();
    await page.clock.fastForward(10000);
    await page.evaluate(() => {
      const key = 'drum-hero:improvisation:v1', data = JSON.parse(localStorage.getItem(key)!);
      const first = data.sessions[0]; first.phrases[0].timingDistanceMs = 70;
      data.sessions.push({ ...first, id: 'comparable-second', phrases: first.phrases.map((p: object) => ({ ...p })) });
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Try this next', exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: /Tempo/ })).toHaveValue('80');
    await page.getByRole('button', { name: 'Apply practice suggestion', exact: true }).click();
    await expect(page.getByRole('slider', { name: /Tempo/ })).toHaveValue('160');
    await expect(page.getByRole('combobox', { name: 'Bars per turn', exact: true })).toHaveValue('2');
  });
});

test('MIDI sound check shows mapping, velocity and saved latency and recovers from disconnect', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('drum-hero:trainer:v1', JSON.stringify({ version: 2, rounds: [], deviceProfiles: { 'midi:check-kit': { latencyMs: 32, midiMap: { 60: 'snare' } } } }));
    const input = { id: 'check-kit', name: 'Check kit', state: 'connected', onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null };
    const access = { inputs: new Map([['check-kit', input]]), onstatechange: null as ((event: { port: { id: string; type: string; state: string } }) => void) | null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
    Object.assign(window, {
      checkMidi: (note: number, velocity: number) => input.onmidimessage?.({ data: new Uint8Array([0x99, note, velocity]), timeStamp: performance.now() }),
      disconnectCheckMidi: () => { input.state = 'disconnected'; access.onstatechange?.({ port: { id: input.id, type: 'input', state: 'disconnected' } }); }
    });
  });
  await configure(page, 'trading', 'midi');
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await page.getByText('Pre-session sound and input check', { exact: true }).click();
  await page.getByRole('button', { name: 'Start sound check', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End sound check', exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { checkMidi: (note: number, velocity: number) => void }).checkMidi(60, 72));
  await expect(page.getByText('Received Snare · velocity 72 · saved correction 32 ms', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { checkMidi: (note: number, velocity: number) => void }).checkMidi(61, 80));
  await expect(page.getByText('MIDI note 61 has no saved mapping. Map it in Trainer before practicing.', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { disconnectCheckMidi: () => void }).disconnectCheckMidi());
  await expect(page.getByRole('button', { name: 'End sound check', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Input', exact: true }).selectOption('keyboard');
  await page.getByRole('button', { name: 'Start sound check', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End sound check', exact: true })).toBeVisible();
  expect(await saved(page)).toHaveLength(0);
});
