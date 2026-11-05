import { describe, expect, it } from 'vitest';
import { examples, normalizeSong, type DrumPart } from '@/lib/song-library';
import { buildArrangementBars, grooveToPart } from '@/lib/song-builder';
import { partToSavedGroove, previewGridChange } from '@/lib/song-builder-editing';
import { parseCustomGrooves } from '@/lib/custom-grooves';
import { playbackTrack } from '@/lib/song-builder-playback';
import { arrangementMusicXml } from '@/lib/song-builder-export';
import { createSongFromMusicXmlPreview, reviewMusicXmlChanges, type MusicXmlPreview } from '@/lib/song-builder-musicxml-import';

const quintuplet = (): DrumPart => ({ id:'five', name:'Five', bpm:100, beats:4, meter:'4/4', subdivision:20, hits:[0,1,2,3,4].map(step=>({step,instrument:'snare' as const,velocity:90})) });
const song = () => { const value=structuredClone(examples[0]); value.id='quintuplet'; value.bundled=false; value.bpm=100; value.sections=[{id:'verse',name:'Verse',kind:'verse',notes:'',bpm:100,parts:[quintuplet()],clips:[{id:'clip',partId:'five',repeats:1}]}]; return value; };

describe('quintuplet editing and import', () => {
  it('preserves a quintuplet through the song and custom groove stores', () => {
    const source=song(); const restored=normalizeSong(source); expect(restored?.sections[0].parts[0].hits.map(hit=>hit.step)).toEqual([0,1,2,3,4]);
    const saved=partToSavedGroove(quintuplet(),'Five','',false); const parsed=parseCustomGrooves(JSON.stringify([saved]));
    expect(grooveToPart(parsed[0],100).subdivision).toBe(20); expect(grooveToPart(parsed[0],100).hits.map(hit=>hit.step)).toEqual([0,1,2,3,4]);
    const odd={...quintuplet(),beats:3.5,meter:'7/8'}; expect(normalizeSong({...source,sections:[{...source.sections[0],parts:[odd]}]})?.sections[0].parts[0].beats).toBe(3.5);
    expect(previewGridChange({...odd,subdivision:8},20).error).toBe('');
    expect(parseCustomGrooves(JSON.stringify([partToSavedGroove(odd,'Odd five','',false)]))[0].beats).toBe(3.5);
  });
  it('plays five evenly spaced hits and exports exact quintuplet notation', async () => {
    const source=song(), track=playbackTrack(source); expect(track.cues.filter(cue=>cue.kind==='hit').map(cue=>cue.at)).toEqual([0,120,240,360,480]);
    const xml=await arrangementMusicXml(buildArrangementBars(source),'Five','Test').text();
    expect(xml).toContain('<divisions>240</divisions>'); expect(xml).toContain('<actual-notes>5</actual-notes><normal-notes>4</normal-notes>');
    expect(xml).toContain('<duration>48</duration>'); expect(xml).toContain('<tuplet type="start"'); expect(xml).toContain('<tuplet type="stop"');
  });
  it('reports the actual rounding and merged mapped voices before import', () => {
    const preview:MusicXmlPreview={title:'Review',artist:'Test',measures:[{meter:'4/4',bpm:100,beats:4}],sources:[{id:'a',label:'A',count:1,defaultVoice:'snare'},{id:'b',label:'B',count:1,defaultVoice:'snare'}],notes:[{measure:1,beat:.125,sourceId:'a',velocity:70,duration:.1},{measure:1,beat:.13,sourceId:'b',velocity:100,duration:.1}],warnings:[]};
    const mapping={a:'snare',b:'snare'} as const, issues=reviewMusicXmlChanges(preview,mapping);
    expect(issues).toHaveLength(2); expect(issues.every(issue=>issue.rounded && issue.merged)).toBe(true);
    const result=createSongFromMusicXmlPreview(preview,mapping); expect(result.song.sections[0].parts[0].hits).toHaveLength(1); expect(result.song.sections[0].parts[0].hits[0].velocity).toBe(100);
    expect(reviewMusicXmlChanges(preview,{a:'snare',b:'kick'}).some(issue=>issue.merged)).toBe(false);
  });
});
