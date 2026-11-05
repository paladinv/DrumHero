import type { DrumSong } from './song-library';
import { songVoiceLabel, type ArrangementBar, type ArrangedHit } from './song-builder';
import { SONG_INSTRUMENTS, type SongInstrument } from './types';
export type NotationView='tab'|'staff';
export type NotationOptions={paperSize?:'letter'|'a4';orientation?:'portrait'|'landscape';barsPerPage:4|6|8;cymbalNoteheads:'cross'|'diamond';showSticking:boolean;showArticulationMarks?:boolean;staffPositions?:Partial<Record<SongInstrument,number>>;beamGrouping:'auto'|'2'|'3'|'4'|'off';barsPerLine?:1|2|3|4;sectionLineBreaks?:boolean;pageBreakBeforeSections?:string[]};
export const SHEET_WIDTH=1100,SHEET_HEIGHT=850,BARS_PER_SHEET_PAGE=6;
export const DEFAULT_NOTATION_OPTIONS:NotationOptions={barsPerPage:6,barsPerLine:2,cymbalNoteheads:'cross',showSticking:true,showArticulationMarks:true,staffPositions:{kick:3,snare:-1,rimshot:-1,tom:-2,hihat:-5,openhat:-5,ride:-4,crash:-6},beamGrouping:'auto',sectionLineBreaks:false,pageBreakBeforeSections:[]};
export function notationSize(options:NotationOptions){const portrait=options.orientation==='portrait',long=1100,short=options.paperSize==='a4'?778:850;return {width:portrait?short:long,height:portrait?long:short};}
export function paginateNotation(bars:ArrangementBar[],options:NotationOptions=DEFAULT_NOTATION_OPTIONS):ArrangementBar[][]{
  const pages:ArrangementBar[][]=[];let current:ArrangementBar[]=[],lineLength=0,lines=1;
  const perLine=options.barsPerLine??2;
  for(const bar of bars){
    const previous=current.at(-1),newSection=previous&&previous.sectionId!==bar.sectionId;
    const newLine=lineLength>=perLine||(newSection&&options.sectionLineBreaks);
    if(current.length&&(current.length>=options.barsPerPage||(newSection&&options.pageBreakBeforeSections?.includes(bar.sectionId))||(newLine&&lines>=4))){pages.push(current);current=[];lineLength=0;lines=1;}
    else if(newLine){lineLength=0;lines++;}
    current.push(bar);lineLength++;
  }
  if(current.length)pages.push(current);return pages;
}
export function notationSystems(page:ArrangementBar[],options:NotationOptions):ArrangementBar[][]{
  const rows:ArrangementBar[][]=[];let row:ArrangementBar[]=[];
  for(const bar of page){if(row.length>= (options.barsPerLine??2)||(row.length&&options.sectionLineBreaks&&row.at(-1)?.sectionId!==bar.sectionId)){rows.push(row);row=[];}row.push(bar);}if(row.length)rows.push(row);return rows;
}
export function notationGeometry(bars:ArrangementBar[],pageIndex:number,options:NotationOptions){
  const page=paginateNotation(bars,options)[pageIndex]??[],rows=notationSystems(page,options),height=Math.min(250,(notationSize(options).height-300)/Math.max(1,rows.length));
  const availableWidth=notationSize(options).width-160;
  return rows.flatMap((row,rowIndex)=>row.map((bar,column)=>({bar,barIndex:bars.indexOf(bar),x:112+column*availableWidth/row.length,y:166+rowIndex*height,width:availableWidth/row.length,height,first:column===0})));
}
export function notationBarAtPoint(bars:ArrangementBar[],page:number,options:NotationOptions,x:number,y:number){return notationGeometry(bars,page,options).find(rect=>x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height)?.barIndex;}
export function notationStaffStepAtPoint(bars:ArrangementBar[],page:number,options:NotationOptions,x:number,y:number){
  const rect=notationGeometry(bars,page,options).find(item=>item.bar&&x>=item.x+18&&x<item.x+item.width-20&&y>=item.y+42&&y<item.y+item.height-8);
  if(!rect)return undefined;
  const count=Math.max(1,Math.round(rect.bar.beats*rect.bar.subdivision/4));
  const position=Math.max(0,Math.min(count-1,Math.round((x-(rect.x+18))/Math.max(1,rect.width-38)*count)));
  return {barIndex:rect.barIndex,step:position};
}

export function meterBeamGroups(meter:string):number[]{
  const signature=meter.match(/(\d+)\s*\/\s*(\d+)/),numerator=Number(signature?.[1]??4),denominator=Number(signature?.[2]??4);
  const explicit=meter.match(/\(([^)]+)\)/)?.[1].match(/\d+/g)?.map(Number);
  const groups=explicit?.reduce((a,b)=>a+b,0)===numerator?explicit:denominator===8&&numerator>=6&&numerator%3===0?Array(numerator/3).fill(3) as number[]:denominator===8&&numerator===7?[2,2,3]:denominator===8&&numerator===5?[3,2]:Array(numerator).fill(1) as number[];
  return groups.map(value=>value*4/denominator);
}
export function notationQuarterScale(bar:ArrangementBar){
  const signature=bar.meter.match(/(\d+)\s*\/\s*(\d+)/),numerator=Number(signature?.[1]??4),denominator=Number(signature?.[2]??4);
  return denominator===8&&numerator>=6&&numerator%3===0&&Math.abs(bar.measureBeats-numerator/3)<0.001?1.5:1;
}
function beamGroup(bar:ArrangementBar,step:number,options:NotationOptions){
  if(options.beamGrouping!=='auto'&&options.beamGrouping!=='off')return Math.floor(step/Number(options.beamGrouping));
  const beat=step*4/bar.subdivision,groups=meterBeamGroups(bar.meter).map(group=>group/notationQuarterScale(bar));let end=0;for(let i=0;i<groups.length;i++){end+=groups[i];if(beat<end-0.00001)return i;}return groups.length;
}
export type RhythmEvent={step:number;duration:number;hits:ArrangedHit[];group:number;measureRest?:boolean};
export function percussionRhythm(bar:ArrangementBar,lane:'hands'|'feet',options:NotationOptions=DEFAULT_NOTATION_OPTIONS):RhythmEvent[]{
  const total=bar.beats*bar.subdivision/4;
  const voices=bar.hits.filter(hit=>(hit.instrument==='kick')===(lane==='feet'));
  if(!voices.length)return [{step:0,duration:total,hits:[],group:0,measureRest:true}];
  const precise=(value:number)=>Math.round(value*1000000)/1000000;
  const byStep=new Map<number,ArrangedHit[]>();
  voices.forEach(hit=>{const step=precise(Math.max(0,Math.min(total-0.000001,hit.beat*bar.subdivision/4)));byStep.set(step,[...(byStep.get(step)??[]),hit]);});
  const phase=0;
  const boundaries=new Set<number>([0,precise(total),...byStep.keys()]);
  for(let step=phase;step<total-0.000001;step++)boundaries.add(precise(step));
  const points=[...boundaries].sort((a,b)=>a-b),events:RhythmEvent[]=[];
  for(let index=0;index<points.length-1;){
    const step=points[index],hits=byStep.get(step)??[],group=beamGroup(bar,step,options);let end=index+1;
    if(!hits.length){let possibleEnd=end;while(possibleEnd<points.length-1&&!byStep.has(points[possibleEnd])&&beamGroup(bar,points[possibleEnd],options)===group)possibleEnd++;
      const candidates=bar.subdivision===12?[3,1]:bar.subdivision===20?[5,1]:[16,8,4,2,1];
      for(const length of candidates){const at=points.findIndex((value,candidate)=>candidate>index&&candidate<=possibleEnd&&Math.abs(value-step-length)<0.00001);if(at>=0&&Math.abs(step%length)<0.00001){end=at;break;}}
    }
    events.push({step,duration:precise(points[end]-step),hits,group});index=end;
  }
  return events;
}

function fitText(c:CanvasRenderingContext2D,text:string,width:number){if(c.measureText(text).width<=width)return text;let end=text.length;while(end>0&&c.measureText(text.slice(0,end)+'…').width>width)end--;return text.slice(0,end)+'…';}
const ink='#20211e',muted='#6e6d67',coral='#e85348';
const voices:SongInstrument[]=['crash','ride','openhat','hihat','tom','rimshot','snare','kick','cowbell','shaker','tambourine',...SONG_INSTRUMENTS.filter(voice=>voice.startsWith('custom'))];
const names:Partial<Record<SongInstrument,string>>={kick:'Kick',snare:'Snare',hihat:'Hi-hat',openhat:'Open hat',ride:'Ride',rimshot:'Rimshot',tom:'Tom',crash:'Crash',cowbell:'Cowbell',shaker:'Shaker',tambourine:'Tambourine',...Object.fromEntries(SONG_INSTRUMENTS.filter(voice=>voice.startsWith('custom')).map((voice,index)=>[voice,`Custom ${index+1}`]))};
// Common drum-set placement on a five-line percussion staff.
const defaultStaffPositions:Partial<Record<SongInstrument,number>>={kick:3,snare:-1,rimshot:-1,tom:-2,hihat:-5,openhat:-5,ride:-4,crash:-6,cowbell:-3,shaker:-7,tambourine:-6,...Object.fromEntries(SONG_INSTRUMENTS.filter(voice=>voice.startsWith('custom')).map((voice,index)=>[voice,[0,1,-1,2][index%4]]))};
const voiceY=(voice:SongInstrument,options:NotationOptions)=>Math.max(-8,Math.min(8,options.staffPositions?.[voice]??defaultStaffPositions[voice]??0))*5;
function line(c:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,width=1){c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function rest(c:CanvasRenderingContext2D,x:number,y:number,quarters:number,scale:number,measure=false){
  c.save();c.translate(x,y);c.scale(scale,scale);c.fillStyle=ink;c.strokeStyle=ink;
  if(measure||quarters>=2){c.fillRect(-5,quarters>=4||measure?0:-4,10,4);}
  else if(quarters>=0.99){c.lineWidth=2;c.beginPath();c.moveTo(1,-10);c.lineTo(-3,-4);c.lineTo(3,2);c.lineTo(-2,6);c.lineTo(1,11);c.stroke();}
  else{const flags=quarters<0.49?2:1;line(c,2,-5, -3,10,1.5);for(let i=0;i<flags;i++){c.beginPath();c.arc(-1,-5+i*5,2.5,0,Math.PI*2);c.fill();line(c,0,-4+i*5,4,-8+i*5,1);}}
  c.restore();
}
function noteHead(c:CanvasRenderingContext2D,x:number,y:number,hit:ArrangedHit,scale:number,options:NotationOptions){
  c.fillStyle=ink;c.strokeStyle=ink;const cymbal=['hihat','openhat','ride','crash','rimshot'].includes(hit.instrument);
  if(cymbal){if(options.cymbalNoteheads==='cross'||hit.instrument==='rimshot'){line(c,x-4*scale,y-4*scale,x+4*scale,y+4*scale,1.5);line(c,x+4*scale,y-4*scale,x-4*scale,y+4*scale,1.5);}else{c.beginPath();c.moveTo(x,y-5*scale);c.lineTo(x+4*scale,y);c.lineTo(x,y+5*scale);c.lineTo(x-4*scale,y);c.closePath();c.fill();}}
  else{c.beginPath();c.ellipse(x,y,5*scale,3.5*scale,-0.3,0,Math.PI*2);c.fill();}
  if(hit.instrument==='openhat'){c.beginPath();c.arc(x,y-10*scale,3*scale,0,Math.PI*2);c.stroke();}
  if(hit.instrument==='crash')line(c,x-8*scale,y,x+8*scale,y,1);
  if(options.showArticulationMarks!==false){
    if(hit.ghost){c.font=`${12*scale}px Arial`;c.fillText('(',x-10*scale,y+4*scale);c.fillText(')',x+6*scale,y+4*scale);}
    if(hit.accent){c.font=`bold ${14*scale}px Arial`;c.fillText('>',x-4*scale,y-12*scale);}
    if(hit.articulation==='flam'||hit.articulation==='drag'){for(let i=0;i<(hit.articulation==='drag'?2:1);i++){const gx=x-12*scale-i*6*scale;c.beginPath();c.ellipse(gx,y,2.5*scale,1.8*scale,-0.3,0,Math.PI*2);c.fill();line(c,gx+2*scale,y,gx+2*scale,y-14*scale);}}
    if(hit.articulation==='choke'){c.font=`${10*scale}px Arial`;c.fillText('+',x-3*scale,y-12*scale);}
    if(hit.articulation==='foot-splash'){c.font=`${10*scale}px Arial`;c.fillText('FS',x-6*scale,y+15*scale);}
  }
}
function drawStaff(c:CanvasRenderingContext2D,bar:ArrangementBar,x:number,y:number,width:number,height:number,options:NotationOptions,first:boolean){
  const scale=Math.max(0.65,Math.min(1.25,height/190)),center=y+height*0.54,usable=width-38;
  c.strokeStyle=ink;for(let i=-2;i<=2;i++)line(c,x,center+i*10*scale,x+width,center+i*10*scale,1);
  if(first){c.fillStyle=ink;c.fillRect(x-24,center-13*scale,4,26*scale);c.fillRect(x-16,center-13*scale,4,26*scale);}
  const count=Math.max(0.001,bar.beats*bar.subdivision/4),xAt=(step:number)=>x+18+step/count*usable;
  for(const lane of ['hands','feet'] as const){
    const events=percussionRhythm(bar,lane,options),down=lane==='feet',stemY=center+(down?61:-65)*scale;
    const noteEvents=events.filter(event=>event.hits.length>0);
    const flagsFor=(event:RhythmEvent)=>Math.max(0,Math.round(Math.log2(bar.subdivision/notationQuarterScale(bar)/event.duration*(bar.subdivision===12&&notationQuarterScale(bar)===1?2/3:bar.subdivision===20?4/5:1)/4)));
    const beamed=new Map<RhythmEvent,number>();
    if(options.beamGrouping!=='off'){for(let i=1;i<noteEvents.length;i++){const previous=noteEvents[i-1],next=noteEvents[i],flags=Math.min(flagsFor(previous),flagsFor(next));if(!flags||previous.group!==next.group||Math.abs(next.step-previous.step-previous.duration)>0.00001)continue;beamed.set(previous,Math.max(beamed.get(previous)??0,flags));beamed.set(next,Math.max(beamed.get(next)??0,flags));for(let beam=0;beam<flags;beam++)line(c,xAt(previous.step)+(down?-4:4)*scale,stemY+(down?-1:1)*beam*5*scale,xAt(next.step)+(down?-4:4)*scale,stemY+(down?-1:1)*beam*5*scale,3*scale);}}
    for(const event of events){const hitX=event.measureRest?x+width/2:xAt(event.step);
      if(!event.hits.length){rest(c,hitX,center+(down?38:0)*scale,event.duration*4/bar.subdivision*notationQuarterScale(bar),scale,event.measureRest);continue;}
      for(const hit of event.hits){const hitY=center+voiceY(hit.instrument,options)*scale;noteHead(c,hitX,hitY,hit,scale,options);if(options.showSticking&&hit.sticking){c.fillStyle=muted;c.font=`bold ${10*scale}px Arial`;c.fillText(hit.sticking,hitX-3,center+45*scale);}}
      const stemX=hitX+(down?-4:4)*scale,fromY=center+(down?Math.max(...event.hits.map(hit=>voiceY(hit.instrument,options))):Math.min(...event.hits.map(hit=>voiceY(hit.instrument,options))))*scale;
      c.strokeStyle=ink;line(c,stemX,fromY,stemX,stemY,1.2);
      const flags=flagsFor(event);if(flags>(beamed.get(event)??0)){for(let i=beamed.get(event)??0;i<flags;i++){c.beginPath();c.moveTo(stemX,stemY+(down?-1:1)*i*5*scale);c.quadraticCurveTo(stemX+11*scale,stemY+(down?-13:13)*scale,stemX+5*scale,stemY+(down?-18:18)*scale);c.stroke();}}
      if(options.showArticulationMarks!==false&&event.hits.some(hit=>(hit.articulation==='buzz'||hit.articulation==='roll')))for(let i=0;i<3;i++)line(c,stemX-4*scale,fromY+(down?1:-1)*(15+i*4)*scale,stemX+4*scale,fromY+(down?1:-1)*(20+i*4)*scale,1.5);
    }
  }
  if((bar.subdivision===12&&notationQuarterScale(bar)===1)||bar.subdivision===20){const size=bar.subdivision===20?5:3;c.fillStyle=ink;c.font=`${10*scale}px Arial`;for(let step=0;step+size<=count;step+=size){const left=xAt(step),right=xAt(step+size-1),top=center-82*scale;line(c,left,top,left,top+4);line(c,left,top,(left+right)/2-6,top);line(c,(left+right)/2+6,top,right,top);line(c,right,top,right,top+4);c.fillText(String(size),(left+right)/2-3,top+3);}}
  line(c,x,center-20*scale,x,center+20*scale);line(c,x+width,center-20*scale,x+width,center+20*scale);
}
export function drawNotationPage(song:DrumSong,bars:ArrangementBar[],view:NotationView,pageIndex:number,cursor?:{barIndex:number;fraction:number}|null,options:NotationOptions=DEFAULT_NOTATION_OPTIONS){
  const canvas=document.createElement('canvas');canvas.width=notationSize(options).width;canvas.height=notationSize(options).height;const c=canvas.getContext('2d');if(!c)throw new Error('This browser could not prepare notation.');
  c.fillStyle='#fffdf8';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle=ink;c.font='bold 32px Arial';c.fillText(song.title||'Untitled song',48,55,canvas.width-96);c.font='16px Arial';c.fillStyle=muted;c.fillText(`${song.artist} · ${song.bpm} BPM · ${song.meter}`,48,87,canvas.width-96);c.font='bold 13px Arial';c.fillStyle=coral;c.fillText(view==='staff'?'PERCUSSION STAFF':'DRUM TAB',48,121);c.textAlign='right';c.fillStyle=muted;c.fillText(`Page ${pageIndex+1} / ${Math.max(1,paginateNotation(bars,options).length)}`,canvas.width-48,121);c.textAlign='left';
  for(const rect of notationGeometry(bars,pageIndex,options)){
    const {bar,x,y,width,height,first}=rect;c.fillStyle=coral;c.font='bold 11px Arial';c.fillText(`${bar.number} · ${[bar.marker,bar.sectionName,bar.endingPass?`Ending ${bar.endingPass}`:''].filter(Boolean).join(' · ')}`,x+6,y+12,width-12);c.fillStyle=muted;c.font='11px Arial';c.fillText(fitText(c,`${bar.meter} · ${notationQuarterScale(bar)===1.5?"dotted beat ":""}${Math.round(bar.bpm*10)/10} BPM${bar.dynamics?` · ${bar.dynamics}`:""}${bar.annotation?` · ${bar.annotation}`:""}`,width-12),x+6,y+28);
    if(view==='staff')drawStaff(c,bar,x,y+16,width,height-25,options,first);
    else{
      const gap=Math.min(30,(height-48)/voices.length),top=y+43;
      voices.forEach((voice,row)=>{const lineY=top+row*gap;c.strokeStyle='#d7d1c7';line(c,x,lineY,x+width,lineY);if(first){c.fillStyle=muted;c.font=`bold ${Math.min(12,gap-1)}px Arial`;c.fillText(songVoiceLabel({voiceLabels:bar.voiceLabels},voice),35,lineY+3,72);}for(let beat=0;beat<bar.beats;beat++){const gx=x+18+beat/bar.beats*(width-38);c.strokeStyle='#e8e2d8';line(c,gx,lineY-gap/2,gx,lineY+gap/2);}
        bar.hits.filter(hit=>hit.instrument===voice).forEach(hit=>{const hx=x+18+hit.fraction*(width-38),radius=Math.max(2.5,Math.min(gap*0.23,hit.velocity/19));c.fillStyle=options.showArticulationMarks!==false&&hit.accent?coral:ink;c.strokeStyle=ink;c.beginPath();c.arc(hx,lineY,radius,0,Math.PI*2);if(options.showArticulationMarks!==false&&hit.ghost)c.stroke();else c.fill();if(options.showArticulationMarks!==false&&hit.accent){c.font=`bold ${Math.min(12,gap)}px Arial`;c.fillText('>',hx-3,lineY-radius-2);}if(options.showSticking&&hit.sticking){c.font=`${Math.max(7,Math.min(10,gap*0.4))}px Arial`;c.fillText(hit.sticking,hx-3,lineY+gap*0.45);}if(options.showArticulationMarks!==false&&hit.articulation&&hit.articulation!=='normal'){c.font='8px Arial';c.fillText(hit.articulation==='foot-splash'?'FS':hit.articulation.slice(0,2),hx+radius+1,lineY);}});
      });c.strokeStyle=ink;line(c,x,y+35,x,y+height-5);line(c,x+width,y+35,x+width,y+height-5);
    }
    if(cursor?.barIndex===rect.barIndex){c.strokeStyle=coral;c.save();c.setLineDash([5,4]);const cx=x+18+cursor.fraction*(width-38);line(c,cx,y+32,cx,y+height-3,2);c.restore();}
  }
  c.fillStyle=muted;c.font='11px Arial';c.fillText('Kick: bottom space · snare/rim: middle space · tom: upper line · hats/ride/crash: above staff',48,canvas.height-93,canvas.width-96);c.fillText('○ ghost · > accent · 3 triplet · 5 quintuplet · R/L sticking · open circle: open hat · drum tab dot size: velocity',48,canvas.height-70,canvas.width-96);c.fillText('Drum Hero Song Builder',48,canvas.height-34);return canvas;
}
