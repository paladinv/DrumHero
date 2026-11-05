import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.describe('sight reading', () => {
  test('guided target playback follows the score and records an assisted pass', async ({page}) => {
    await page.goto('/sight-reading');
    await page.getByLabel('Tempo (quarter-note BPM)').fill('200');
    await page.getByRole('combobox',{name:'Bars',exact:true}).selectOption('1');
    await page.getByRole('combobox',{name:'Silent preview'}).selectOption('0');
    await page.getByRole('combobox',{name:'Count-in bars'}).selectOption('0');
    await expect(page.getByLabel('Play target drums during the attempt (assisted)')).toBeChecked();
    await page.getByRole('button',{name:'Start sight reading',exact:true}).click();
    await expect(page.locator('svg[aria-hidden="true"] line')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Before seeing your score'})).toBeVisible({timeout:10000});
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drum-hero:sight-reading:v1')!).attempts[0]);
    expect(saved).toMatchObject({classification:'assisted',targetPlayback:true});
  });
  test('first pass, keyboard/pads, retry integrity, and learner history', async ({page}, testInfo) => {
    test.setTimeout(65000);
    await page.addInitScript(() => {
      localStorage.setItem('drum-hero:learner-profiles:v1',JSON.stringify([{id:'reader',name:'Reader',createdAt:'2026-10-22T12:00:00Z'}]));
      localStorage.setItem('drum-hero:active-learner:v1','reader');
    });
    await page.goto('/sight-reading');
    await page.getByLabel('Tempo (quarter-note BPM)').fill('200');
    await page.getByRole('combobox',{name:'Bars',exact:true}).selectOption('1');
    await page.getByLabel('Play target drums during the attempt (assisted)').uncheck();
    await expect(page.getByRole('img',{name:/Percussion staff/})).toHaveCount(0);
    await page.getByRole('button',{name:'Start sight reading',exact:true}).click();
    await expect(page.getByText(/Silent preview/)).toBeVisible();
    await expect(page.getByRole('img',{name:/Percussion staff/})).toBeVisible();
    await expect(page.getByRole('button',{name:'Play reference',exact:true})).toHaveCount(0);
    await expect(page.getByText('Play the notation',{exact:true})).toBeVisible({timeout:16000});
    await page.keyboard.press('f');
    await page.getByRole('button',{name:'Snare F',exact:true}).dispatchEvent('pointerdown');
    await expect(page.getByRole('heading',{name:'Before seeing your score'})).toBeFocused({timeout:8000});
    await page.getByRole('button',{name:'Skip',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sight-reading results'})).toBeFocused();
    await expect(page.getByText(/First reading ·/)).toBeVisible();
    const key='drum-hero:sight-reading:v1:profile:reader';
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).attempts,key);
    expect(saved).toHaveLength(1);expect(saved[0].classification).toBe('reading');
    expect(await page.evaluate(()=>localStorage.getItem('drum-hero:sight-reading:v1'))).toBeNull();
    await page.getByRole('button',{name:'Retry as practice',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Before seeing your score'})).toBeVisible({timeout:18000});
    await page.getByRole('button',{name:'Skip',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sight-reading results'})).toBeVisible();
    await expect(page.getByText(/Practice retry ·/)).toBeVisible();
    await expect(page.getByRole('table',{name:'Accuracy by rhythm family'})).toBeVisible();
    await page.getByRole('button',{name:'Practice weakest bar twice'}).click();
    await expect(page.getByRole('button',{name:'Retry as practice',exact:true})).toBeVisible();
    await expect(page.getByRole('combobox',{name:'Bars',exact:true})).toHaveValue('2');
    const retried=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).attempts,key);
    expect(retried[1].seed).toBe(saved[0].seed);expect(retried[1].classification).toBe('practice');
    expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact ?? ''))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('sight-results.png'),fullPage:true});
  });
  test('cancel and background end attempts without saving, restarting is practice', async ({page}) => {
    await page.goto('/sight-reading');
    await page.getByRole('button',{name:'Start sight reading',exact:true}).click();
    await page.getByRole('button',{name:'Cancel attempt',exact:true}).click();
    await expect(page.getByRole('button',{name:'Retry as practice',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('drum-hero:sight-reading:v1'))).toBeNull();
    await page.getByRole('button',{name:'Retry as practice',exact:true}).click();
    await page.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByRole('button',{name:'Retry as practice',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('drum-hero:sight-reading:v1'))).toBeNull();
  });
  test('cold read skips preview and count-in, then records the selected setup', async ({page}) => {
    await page.goto('/sight-reading');
    await page.getByLabel('Tempo (quarter-note BPM)').fill('200');
    await page.getByRole('combobox',{name:'Bars',exact:true}).selectOption('1');
    await page.getByLabel('Play target drums during the attempt (assisted)').uncheck();
    await page.getByRole('combobox',{name:'Silent preview'}).selectOption('0');
    await page.getByRole('combobox',{name:'Count-in bars'}).selectOption('0');
    await page.getByRole('button',{name:'Start sight reading',exact:true}).click();
    await expect(page.getByText('Play the notation',{exact:true})).toBeVisible();
    await expect(page.getByRole('img',{name:/Percussion staff/})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Before seeing your score'})).toBeVisible({timeout:10000});
    await page.getByRole('button',{name:'Skip',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sight-reading results'})).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drum-hero:sight-reading:v1')!).attempts[0]);
    expect(saved).toMatchObject({classification:'reading',previewSeconds:0,countInBars:0});
  });
  test('selected MIDI input loss cancels without a reading result', async ({page}) => {
    await page.addInitScript(() => {
      const input = {id:'test-kit',name:'Test kit',state:'connected',onmidimessage:null};
      const access = {inputs:new Map([['test-kit',input]]),onstatechange:null as null | (()=>void)};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access,configurable:true});
      Object.assign(window,{disconnectReadingMidi:()=>{input.state='disconnected';access.inputs.clear();access.onstatechange?.();}});
    });
    await page.goto('/sight-reading');
    await page.getByRole('combobox',{name:'Input',exact:true}).first().selectOption('midi');
    await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'MIDI device'})).toHaveValue('test-kit');
    await page.getByRole('button',{name:'Start sight reading',exact:true}).click();
    await expect(page.getByRole('button',{name:'Cancel attempt',exact:true})).toBeVisible();
    await page.evaluate(()=>{(window as unknown as {disconnectReadingMidi:()=>void}).disconnectReadingMidi();});
    await expect(page.getByRole('button',{name:'Retry as practice',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('drum-hero:sight-reading:v1'))).toBeNull();
  });
  test('MIDI pad learning assigns the selected voice and calibration controls are available', async ({page}) => {
    await page.addInitScript(() => {
      const input = {id:'learn-kit',name:'Learn kit',state:'connected',onmidimessage:null as null | ((event:{data:Uint8Array;timeStamp:number})=>void)};
      const access = {inputs:new Map([['learn-kit',input]]),onstatechange:null as null | (()=>void)};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access,configurable:true});
      Object.assign(window,{sendReadingMidi:(note:number)=>input.onmidimessage?.({data:new Uint8Array([0x90,note,100]),timeStamp:performance.now()})});
    });
    await page.goto('/sight-reading');
    await page.getByRole('combobox',{name:'Input',exact:true}).first().selectOption('midi');
    await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();
    await page.getByRole('button',{name:'Learn kick pad'}).click();
    await page.evaluate(()=>{(window as unknown as {sendReadingMidi:(note:number)=>void}).sendReadingMidi(52);});
    await expect(page.getByText('Mapped MIDI note 52 to kick.')).toBeVisible();
    await expect(page.getByLabel('Device timing correction', {exact:false})).toBeVisible();
  });
  test('all meters and subdivisions render, new exercises stay hidden until preview', async ({page}, testInfo) => {
    await page.goto('/sight-reading');
    await page.getByRole('combobox',{name:'Level',exact:true}).first().selectOption('Advanced');
    await page.getByRole('combobox',{name:'Bars',exact:true}).selectOption('4');
    for (const meter of ['4/4','3/4','5/4','7/8']) {
      await page.getByRole('combobox',{name:'Meter',exact:true}).first().selectOption(meter);
      for (const triplets of meter==='7/8'?[false]:[false,true]) {
        if(meter!=='7/8') await page.getByLabel('Triplets',{exact:true}).setChecked(triplets);
        await page.getByRole('button',{name:'Start sight reading',exact:true}).click();
        await expect(page.getByRole('img',{name:/Percussion staff/})).toBeVisible();
        await page.screenshot({path:testInfo.outputPath(`notation-${meter.replace('/','-')}-${triplets}.png`),fullPage:true});
        await page.getByRole('button',{name:'Cancel attempt',exact:true}).click();
        await page.getByRole('button',{name:'New exercise',exact:true}).click();
        await expect(page.getByRole('img',{name:/Percussion staff/})).toHaveCount(0);
      }
    }
  });
  test('adaptive tempo, focused assignment import, learner goal, progress chart, and print view', async ({page}) => {
    await page.addInitScript(() => {
      const settings = {level:'Beginner',bpm:80,bars:2,meter:'4/4',triplets:false,snareOnly:false,focusVoice:'mixed',focusRhythm:'mixed',style:'varied'};
      const attempts = Array.from({length:3},(_,index)=>({id:`prior-${index}`,playedAt:new Date(Date.now()-index*86400000).toISOString(),version:1,seed:index,settings,source:'keyboard',inputProfile:'keyboard',classification:'reading',score:92,accuracy:92,meanOffsetMs:4,misses:1,extras:0}));
      localStorage.setItem('drum-hero:sight-reading:v1',JSON.stringify({version:1,attempts}));
    });
    await page.goto('/sight-reading');
    await page.getByRole('button',{name:'Use suggested tempo',exact:true}).click();
    await expect(page.getByLabel('Tempo (quarter-note BPM)')).toHaveValue('85');
    await expect(page.getByRole('img',{name:/Recent first-reading accuracy/})).toBeVisible();
    const code = await page.evaluate(() => {
      const assignment = {version:1,seed:9876,title:'Odd meter study',dueDate:'2026-10-31',minimumAccuracy:85,settings:{level:'Advanced',bpm:112,bars:1,meter:'5/4',triplets:false,snareOnly:false,focusVoice:'tom',focusRhythm:'sixteenths',style:'fill'}};
      const bytes = new TextEncoder().encode(JSON.stringify(assignment));
      const payload = btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
      return `DH-SA1:${payload}`;
    });
    await page.getByText('Teacher assignment and student result').click();
    await page.getByLabel('Assignment or student result code').fill(code);
    await page.getByRole('button',{name:'Load assignment / review result'}).click();
    await expect(page.getByRole('combobox',{name:'Level',exact:true}).first()).toHaveValue('Advanced');
    await expect(page.getByRole('combobox',{name:'Meter',exact:true}).first()).toHaveValue('5/4');
    await expect(page.getByRole('combobox',{name:'Rhythm focus',exact:true})).toHaveValue('sixteenths');
    await expect(page.getByRole('combobox',{name:'Voice focus',exact:true})).toHaveValue('tom');
    await expect(page.getByRole('combobox',{name:'Groove and phrase'})).toHaveValue('fill');
    await expect(page.getByText(/Odd meter study.*due 2026-10-31.*target 85%/)).toBeVisible();
    await page.getByRole('button',{name:'Print exercise'}).click();
    await expect(page.getByRole('img',{name:/Percussion staff/})).toBeVisible();
    await page.emulateMedia({media:'print'});
    await expect(page.locator('fieldset')).toBeHidden();
    await page.emulateMedia({media:'screen'});
    await page.getByLabel('Accuracy target').fill('85');
    await page.getByLabel('First readings to complete').fill('3');
    await page.getByRole('button',{name:'Save goal'}).click();
    await expect(page.getByRole('progressbar',{name:'Practice goal progress'})).toHaveAttribute('max','3');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('drum-hero:sight-reading-goal:v1')!).targetReads)).toBe(3);
  });
});
