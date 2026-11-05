import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const key='drum-hero:assessment:v1';
const draftKey='drum-hero:assessment-draft:v1';
async function begin(page: import('@playwright/test').Page) {
  await page.goto('/assessment');
  await page.getByRole('button',{name:'Enable sound and check input',exact:true}).click();
  await expect(page.getByRole('status').last()).toContainText('Strike a pad');
  await page.getByRole('button',{name:'snare · F',exact:true}).dispatchEvent('pointerdown');
  await page.getByRole('button',{name:'Begin assessment',exact:true}).click();
}
test.describe('initial skill assessment',()=>{
 test('skips remain untested, early exit cannot apply an empty plan, and history deletes',async({page},testInfo)=>{
  await begin(page);
  await page.getByRole('button',{name:'End assessment and view results'}).click();
  await expect(page.getByRole('heading',{name:'Assessment results',exact:true})).toBeFocused();
  await expect(page.getByLabel('Measurement quality')).toBeVisible();
  await expect(page.getByRole('button',{name:'Use this starting plan'})).toHaveCount(0);
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
  expect(stored.results[0].attempts).toEqual([]);expect(stored.appliedId).toBeNull();
  expect(await page.evaluate(key=>localStorage.getItem(key),draftKey)).toBeNull();
  const violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??''));expect(violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('assessment-results.png'),fullPage:true});
  page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Assessment results',exact:true})).toHaveCount(0);
 });
 test('resumes only completed assessment tasks after a reload',async({page})=>{
  await begin(page);await page.getByRole('button',{name:'Skip this domain'}).click();
  const checkpoint=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),draftKey);expect(checkpoint.result.skipped).toContain('pulse-1');
  await page.reload();await expect(page.getByRole('button',{name:'Resume saved assessment'})).toBeVisible();await page.getByRole('button',{name:'Resume saved assessment'}).click();
  await expect(page.getByRole('heading',{name:/Eighth-note groups/})).toBeVisible();
  await page.getByRole('button',{name:'End assessment and view results'}).click();expect(await page.evaluate(key=>localStorage.getItem(key),draftKey)).toBeNull();
 });
 test('quiz answer produces an opt-in recommendation, survives retake, and updates Home',async({page})=>{
  await begin(page);
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Skip this domain'}).click();
  const quizHeading=page.getByRole('heading',{name:/^(Listening|Notation) question$/});await expect(quizHeading).toBeVisible();
  const quizCard=page.locator('section.card').filter({has:quizHeading});
  const listening=await quizCard.getByRole('button',{name:'Play rhythm'}).count();
  await quizCard.getByRole('button').nth(listening?1:0).click();
  await page.getByRole('button',{name:'End assessment and view results'}).click();
  let stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);expect(stored.appliedId).toBeNull();
  await page.getByRole('button',{name:'Use this starting plan'}).click();
  stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);expect(stored.appliedId).toBe(stored.results[0].id);
  const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('drum-hero:progress:v1')!));expect(progress.completedLessons).toEqual([]);expect(progress.sessions).toEqual([]);
  await page.getByRole('button',{name:'Retake assessment'}).click();expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).appliedId).toBe(stored.appliedId);
  // Applying a starting point also supports review of an already-completed lesson.
  await page.evaluate(()=>{const key='drum-hero:progress:v1';const value=JSON.parse(localStorage.getItem(key)!);value.completedLessons=['count-the-grid'];localStorage.setItem(key,JSON.stringify(value));});
  await page.goto('/');await expect(page.getByRole('link',{name:/Recommended next Count the grid/})).toBeVisible();
 });
 test('interrupted attempt is discarded; completed probe records misses separately from practice',async({page})=>{
  test.setTimeout(65000);await begin(page);
  await page.getByRole('button',{name:'Demonstrate and play'}).click();
  await expect(page.getByRole('status').last()).toContainText('Listen to the demonstration');
  await page.getByRole('button',{name:'Pause and discard this attempt'}).click();
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  await page.getByRole('button',{name:'Restart interrupted probe'}).click();
  await expect(page.getByRole('status').last()).toContainText('Play ·',{timeout:14000});
  // Input spans the next beat so browser assertion polling does not decide hit timing.
  for(let i=0;i<12;i++){await page.keyboard.press('f');await page.waitForTimeout(100);}
  await expect(page.getByRole('status').last()).toContainText('Try once more',{timeout:22000});
  await page.getByRole('button',{name:'End assessment and view results'}).click();
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);expect(stored.results[0].attempts).toHaveLength(1);expect(stored.results[0].attempts[0].misses).toBeLessThan(16);expect(stored.results[0].attempts[0].accuracy).toBeGreaterThan(0);
  expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('drum-hero:progress:v1')))! ).sessions).toEqual([]);
 });
 test('MIDI disconnect pauses and preserves the current probe',async({page})=>{
  await page.addInitScript(()=>{
   const input={id:'assessment-kit',name:'Test kit',state:'connected',onmidimessage:null as null|((event:{data:Uint8Array;timeStamp:number})=>void)};
   const access={inputs:new Map([['assessment-kit',input]]),onstatechange:null as null|(()=>void)};
   Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access,configurable:true});
   Object.assign(window,{assessmentMidiHit:()=>input.onmidimessage?.({data:new Uint8Array([0x99,38,90]),timeStamp:performance.now()}),assessmentDisconnect:()=>{input.state='disconnected';access.inputs.clear();access.onstatechange?.();}});
  });
  await page.goto('/assessment');await page.getByRole('combobox',{name:'Input',exact:true}).selectOption('midi');await page.getByRole('button',{name:'Connect MIDI'}).click();
  await page.getByRole('button',{name:'Enable sound and check input'}).click();await expect(page.getByRole('status').last()).toContainText('Strike a pad');
  await page.evaluate(()=>{(window as unknown as {assessmentMidiHit:()=>void}).assessmentMidiHit();});await page.getByRole('button',{name:'Begin assessment'}).click();await page.getByRole('button',{name:'Demonstrate and play'}).click();
  await page.evaluate(()=>{(window as unknown as {assessmentDisconnect:()=>void}).assessmentDisconnect();});await expect(page.getByRole('button',{name:'Restart interrupted probe'})).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 });
 test('learner change resets an active assessment without leaking results',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('drum-hero:learner-profiles:v1',JSON.stringify([{id:'one',name:'One',createdAt:'2026-10-22T12:00:00Z'},{id:'two',name:'Two',createdAt:'2026-10-22T12:00:00Z'}]));localStorage.setItem('drum-hero:active-learner:v1','one');});
  await begin(page);await page.getByRole('button',{name:'Demonstrate and play'}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('drum-hero:learner-profile-change',{detail:{profileId:'two'}})));
  await expect(page.getByRole('button',{name:'Begin assessment'})).toBeVisible();await expect(page.getByRole('button',{name:'Begin assessment'})).toBeDisabled();
  expect(await page.evaluate(key=>localStorage.getItem(key+':profile:one'),key)).toBeNull();expect(await page.evaluate(key=>localStorage.getItem(key+':profile:two'),key)).toBeNull();
  expect(await page.evaluate(key=>localStorage.getItem(key+':profile:one'),draftKey)).not.toBeNull();expect(await page.evaluate(key=>localStorage.getItem(key+':profile:two'),draftKey)).toBeNull();
 });
 test('trainer provides a return path for the assessment practice-and-recheck loop',async({page})=>{
  await page.goto('/trainer?pattern=first-beat&assessmentFollowUp=1');await expect(page.getByText('Assessment practice',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Return to assessment'})).toHaveAttribute('href','/assessment');
 });
});
