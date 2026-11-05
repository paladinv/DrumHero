import { test, expect } from '@playwright/test';

const fixture = { version:1, songs:[{id:'builder-check',title:'Builder Check',artist:'Test',difficulty:'Beginner',bpm:100,meter:'4/4',tags:[],notes:'',bundled:false,sections:[{id:'verse',name:'Verse',kind:'verse',notes:'',parts:[{id:'part',name:'Pattern',bpm:100,beats:4,subdivision:8,meter:'4/4',hits:[{step:0,instrument:'kick',velocity:80},{step:1,instrument:'kick',velocity:80},{step:2,instrument:'kick',velocity:80}]}],clips:[{id:'clip',partId:'part',repeats:1}]}]}],collections:[],favorites:[],progress:[],queues:[],setlists:[],journals:[],notes:[],schedules:[],recordings:[],reviews:[],tempoRamps:[],checklists:[],snapshots:[],roles:[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(value => { localStorage.setItem('drum-hero:song-library:v1',JSON.stringify(value)); }, fixture);
});

test('a velocity brush drag is one undoable edit', async ({ page }) => {
  await page.goto('/song-builder?song=builder-check');
  await page.locator('.song-builder-velocity-editor').getByLabel('Voice').selectOption('kick');
  await page.getByRole('checkbox',{name:'Paint velocity'}).check();
  await page.getByLabel('Velocity paint brush value').fill('43');
  const lane=page.locator('.song-builder-velocity-lane');
  const first=lane.locator('label').nth(0), third=lane.locator('label').nth(2);
  const a=await first.boundingBox(), b=await third.boundingBox();
  if (!a || !b) throw new Error('Velocity lane is unavailable');
  await page.mouse.move(a.x+a.width/2,a.y+20); await page.mouse.down(); await page.mouse.move(b.x+b.width/2,b.y+20,{steps:12}); await page.mouse.up();
  for(let step=1;step<=3;step++) await expect(page.getByLabel(`Kick step ${step} velocity`)).toHaveValue('43');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  for(let step=1;step<=3;step++) await expect(page.getByLabel(`Kick step ${step} velocity`)).toHaveValue('80');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  for(let step=1;step<=3;step++) await expect(page.getByLabel(`Kick step ${step} velocity`)).toHaveValue('43');
  const articulation=page.locator('.song-builder-articulation-lane');
  await articulation.scrollIntoViewIfNeeded();
  const start=await articulation.locator('button').nth(0).boundingBox(), end=await articulation.locator('button').nth(2).boundingBox();
  if (!start || !end) throw new Error('Articulation lane is unavailable');
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2); await page.mouse.down(); await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:12}); await page.mouse.up();
  for(let step=0;step<3;step++) await expect(articulation.locator('button').nth(step)).toHaveAttribute('aria-label',/: flam\./);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  for(let step=0;step<3;step++) await expect(articulation.locator('button').nth(step)).toHaveAttribute('aria-label',/: normal\./);
});

test('MIDI transport follows start, stop, continue, and reports clock loss', async ({ page }) => {
  await page.addInitScript(() => {
    const input={id:'test-midi',name:'Test MIDI',state:'connected',onmidimessage:null as null | ((event:{data:Uint8Array;receivedTime:number})=>void),open:async()=>{}};
    (window as unknown as {testMidi:typeof input}).testMidi=input;
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[input.id,input]]),outputs:new Map(),onstatechange:null})});
  });
  await page.goto('/song-builder?song=builder-check');
  await page.getByRole('checkbox',{name:'Play drums'}).uncheck();
  await page.getByRole('checkbox',{name:'Metronome'}).uncheck();
  await page.getByRole('checkbox',{name:'Loop range'}).check();
  await page.getByRole('button',{name:'Rehearse',exact:true}).click();
  await page.getByRole('button',{name:'Connect MIDI kit / clock'}).click();
  await expect(page.getByLabel('MIDI input')).toHaveValue('test-midi');
  await page.getByRole('checkbox',{name:'Follow external transport and tempo'}).check();
  const send=async(status:number)=>page.evaluate(value=>{ const input=(window as unknown as {testMidi:{onmidimessage: null | ((event:{data:Uint8Array;receivedTime:number})=>void)}}).testMidi; input.onmidimessage?.({data:new Uint8Array([value]),receivedTime:performance.now()}); },status);
  await send(0xfa);
  await expect(page.getByText(/Playing ·/)).toBeVisible();
  await page.evaluate(()=>{const input=(window as unknown as {testMidi:{onmidimessage: null | ((event:{data:Uint8Array;receivedTime:number})=>void)}}).testMidi;const now=performance.now();for(let i=0;i<25;i++)input.onmidimessage?.({data:new Uint8Array([0xf8]),receivedTime:now-480+i*20});});
  await expect(page.getByText(/incoming clock 125 BPM/)).toBeVisible();
  await send(0xfc); await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await send(0xfb); await expect(page.getByText(/Playing ·/)).toBeVisible();
  await expect(page.getByText(/Clock: lost/)).toBeVisible({timeout:4000});
  await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await send(0xfb); await expect(page.getByText(/Clock: running/)).toBeVisible();
});

test('MusicXML review identifies merged notes before importing', async ({ page }) => {
  await page.goto('/song-builder?song=builder-check');
  const xml=`<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Collision review</work-title></work><part-list><score-part id="P1"><part-name>Drums</part-name><score-instrument id="I1"><instrument-name>Snare</instrument-name></score-instrument><score-instrument id="I2"><instrument-name>Snare drum</instrument-name></score-instrument></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><unpitched><display-step>D</display-step><display-octave>5</display-octave></unpitched><instrument id="I1"/><duration>1</duration></note><note><chord/><unpitched><display-step>D</display-step><display-octave>5</display-octave></unpitched><instrument id="I2"/><duration>1</duration></note></measure></part></score-partwise>`;
  await page.getByLabel('Choose a MusicXML score').setInputFiles({name:'score.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  await expect(page.getByText('Review rounded and merged notes · 2 affected')).toBeVisible();
  await expect(page.getByRole('cell',{name:'Merged'})).toHaveCount(2);
  await page.getByRole('button',{name:'Import as a personal song'}).click();
  await expect(page.getByRole('status').filter({hasText:'Imported 2 percussion notes'}).first()).toBeVisible();
});

test('downloads the notation as PNG and PDF', async ({ page }) => {
  await page.goto('/song-builder?song=builder-check');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  for (const [label, extension] of [['PNG','.png'],['PDF','.pdf']] as const) {
    const pending=page.waitForEvent('download'); await page.getByRole('button',{name:label,exact:true}).click(); const download=await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`${extension.replace('.', '\\.')}$`));
    const file=await download.path(); expect(file).toBeTruthy();
    const { readFile }=await import('node:fs/promises'); const data=await readFile(file!);
    expect(data.subarray(0, label==='PNG'?4:4).toString(label==='PNG'?'hex':'utf8')).toBe(label==='PNG'?'89504e47':'%PDF');
  }
});
