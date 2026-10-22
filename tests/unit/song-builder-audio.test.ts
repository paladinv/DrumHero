import { afterEach,describe,expect,it,vi } from 'vitest';
import { createDrumAudio } from '@/lib/audio';
class Node {
  gain={value:1,setValueAtTime:vi.fn(),cancelScheduledValues:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()};
  pan={setValueAtTime:vi.fn()};
  buffer:unknown;
  start=vi.fn();stop=vi.fn();connect=vi.fn(()=>this);
}
let sources:Node[]=[];
class Context {
  currentTime=10;destination={};
  createBufferSource(){const node=new Node();sources.push(node);return node;}
  createGain(){return new Node();}
  createStereoPanner(){return new Node();}
  decodeAudioData(){return Promise.resolve({duration:1});}
  resume(){return Promise.resolve();}
  close(){return Promise.resolve();}
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();sources=[];});
describe('Song Builder audio clock',()=>{
 it('schedules drum and click on the audio clock, then cancels queued sources',async()=>{
  vi.stubGlobal('window',{AudioContext:Context});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})));vi.spyOn(performance,'now').mockReturnValue(1000);
  const audio=createDrumAudio()!;await audio.ready;
  audio.scheduleHit('kick',1500,false,100);audio.scheduleClick(1600,true);
  expect(sources[0].start).toHaveBeenCalledWith(10.5);expect(sources[1].start).toHaveBeenCalledWith(10.6,0,.07);
  audio.silence();expect(sources.every(s=>s.stop.mock.calls.length===1)).toBe(true);audio.close();
 });
 it('chokes open hats at the scheduled closed-hat time',async()=>{
  vi.stubGlobal('window',{AudioContext:Context});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})));vi.spyOn(performance,'now').mockReturnValue(1000);
  const audio=createDrumAudio()!;await audio.ready;audio.scheduleHit('openhat',1500);audio.scheduleHit('hihat',1800);
  expect(sources[0].stop.mock.calls[0][0]).toBeCloseTo(10.85);audio.close();
 });
});
