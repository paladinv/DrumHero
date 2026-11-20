import { drawNotationPage,notationGeometry,notationStaffPosition,DEFAULT_NOTATION_OPTIONS,type NotationOptions,type NotationView } from './song-builder-notation';
import type { ArrangementBar } from './song-builder';
import type { AttemptEventTiming, AttemptExtraTiming, DrumSong } from './song-library';
export type CompactMeasure={barIndex:number;x:number;y:number;width:number;height:number;hitStart?:number;hitWidth?:number};
export function compactNotation(song:DrumSong,bars:ArrangementBar[],view:NotationView,page:number,cursor?:{barIndex:number;fraction:number},options:NotationOptions=DEFAULT_NOTATION_OPTIONS,review?:{events?:AttemptEventTiming[];extras?:AttemptExtraTiming[]}){
 const source=drawNotationPage(song,bars,view,page,undefined,options),geometry=notationGeometry(bars,page,options),rows=[...new Set(geometry.map(rect=>rect.y))];
 const bands=rows.map(y=>{const rect=geometry.find(rect=>rect.y===y)!,scale=Math.max(.65,Math.min(1.25,(rect.height-25)/190));return {y,rect,top:view==='staff'?Math.max(y+32,y+16+(rect.height-25)*.54-98*scale):y+32,height:view==='staff'?Math.min(rect.height-32,190*scale):Math.min(rect.height-32,280)};});
 const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=Math.ceil(110+bands.reduce((sum,band)=>sum+band.height+52,0)+58);const context=canvas.getContext('2d');if(!context)throw Error('Notation could not be rendered.');context.fillStyle='#fffdf8';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,1100,105,0,0,1100,105);
 const measures:CompactMeasure[]=[];let targetY=110;
 for(const band of bands){context.drawImage(source,0,band.y,1100,32,0,targetY,1100,32);context.drawImage(source,0,band.top,1100,band.height,0,targetY+32,1100,band.height);for(const rect of geometry.filter(rect=>rect.y===band.y)){measures.push({barIndex:rect.barIndex,x:rect.x,y:targetY,width:rect.width,height:band.height+32,hitStart:rect.x+18,hitWidth:rect.width-38});if(cursor?.barIndex===rect.barIndex){context.save();context.strokeStyle='#d03b2d';context.lineWidth=3;const x=rect.x+18+Math.max(0,Math.min(1,cursor.fraction))*(rect.width-38);context.beginPath();context.moveTo(x,targetY+32);context.lineTo(x,targetY+32+band.height);context.stroke();context.restore();}}targetY+=band.height+52;}
 if(view==='staff'&&(review?.events?.length||review?.extras?.length)){
  context.save();context.font='bold 11px Arial';context.textAlign='center';
  const mark=(barIndex:number,beat:number,instrument:AttemptEventTiming['instrument'],kind:'missed'|'early'|'late'|'clean'|'extra')=>{
   const measure=measures.find(item=>item.barIndex===barIndex),bar=bars[barIndex];if(!measure||!bar)return;
   const scoreHeight=geometry.find(rect=>rect.barIndex===barIndex)?.height??215;
   const scale=Math.max(.65,Math.min(1.25,(scoreHeight-25)/190));
   const x=measure.x+18+Math.max(0,Math.min(1,beat/Math.max(.001,bar.beats)))*(measure.width-38);
   const y=measure.y+32+98*scale-2.5+notationStaffPosition(instrument,options)*5*scale-(kind==='extra'?13:0);
   const color=kind==='missed'?'#b42318':kind==='early'?'#1759a6':kind==='late'?'#a34b08':kind==='extra'?'#7c3aed':'#157347';
   context.strokeStyle=color;context.fillStyle=color;context.lineWidth=2.5;context.beginPath();
   if(kind==='extra'){context.moveTo(x,y-5);context.lineTo(x+5,y);context.lineTo(x,y+5);context.lineTo(x-5,y);context.closePath();context.fill();}
   else{context.arc(x,y,7,0,Math.PI*2);context.stroke();if(kind==='missed'){context.beginPath();context.moveTo(x-3,y-3);context.lineTo(x+3,y+3);context.moveTo(x+3,y-3);context.lineTo(x-3,y+3);context.stroke();}else if(kind==='early'||kind==='late'){context.fillText(kind==='early'?'←':'→',x,y+4);}}
  };
  for(const event of review?.events??[])mark(event.bar-1,event.beat,event.instrument,event.offsetMs===null?'missed':Math.abs(event.offsetMs)<=50?'clean':event.offsetMs<0?'early':'late');
  for(const event of review?.extras??[])mark(event.bar-1,event.beat,event.instrument,'extra');
  context.textAlign='left';context.fillStyle='#50534c';context.fillText('Review: × missed · ← early · → late · ◆ extra · green matched',48,canvas.height-22);context.restore();
 }else{context.fillStyle='#50534c';context.font='14px Arial';context.fillText('> accent · ( ) ghost note · R/L sticking · rests mark silence',48,canvas.height-22);}
 return {canvas,measures};
}

/** A single-measure rendering sized to its container for readable phone practice. */
export function compactFocusedNotation(song:DrumSong,bars:ArrangementBar[],barIndex:number,width:number,view:NotationView,options:NotationOptions=DEFAULT_NOTATION_OPTIONS,cursor?:{barIndex:number;fraction:number},review?:{events?:AttemptEventTiming[];extras?:AttemptExtraTiming[]}){
 const bar=bars[barIndex];if(!bar)return compactNotation(song,bars,view,0,cursor,options,review);
 const logicalWidth=Math.max(320,Math.min(1100,Math.floor(width||360))),height=300,dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
 const canvas=document.createElement('canvas');canvas.width=Math.round(logicalWidth*dpr);canvas.height=Math.round(height*dpr);canvas.style.aspectRatio=`${logicalWidth}/${height}`;
 const c=canvas.getContext('2d');if(!c)throw new Error('Notation could not be rendered.');c.scale(dpr,dpr);c.fillStyle='#fffdf8';c.fillRect(0,0,logicalWidth,height);
 c.fillStyle='#20211e';c.font='bold 18px Arial';c.fillText(song.title||'Untitled song',18,23,logicalWidth-36);c.fillStyle='#6e6d67';c.font='12px Arial';c.fillText(`${bar.sectionName} · bar ${bar.number} · ${bar.meter} · ${bar.bpm} BPM`,18,42,logicalWidth-36);
 const left=30,right=logicalWidth-18,usable=Math.max(1,right-left),count=Math.max(.001,bar.beats*bar.subdivision/4),xAt=(beat:number)=>left+Math.max(0,Math.min(1,beat/Math.max(.001,bar.beats)))*usable;
 const measure:CompactMeasure={barIndex,x:0,y:48,width:logicalWidth,height:220,hitStart:left,hitWidth:usable};
 if(view==='staff'){
  const center=156,scale=1;c.strokeStyle='#20211e';c.lineWidth=1;
  for(let lineIndex=-2;lineIndex<=2;lineIndex++){const y=center+lineIndex*10;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();}
  c.fillStyle='#6e6d67';c.font='10px Arial';for(let beat=0;beat<Math.ceil(bar.beats);beat++)c.fillText(String(beat+1),xAt(beat),190);
  for(const hit of bar.hits){const x=xAt(hit.beat),y=center+notationStaffPosition(hit.instrument,options)*5*scale;c.strokeStyle='#20211e';c.fillStyle='#20211e';c.lineWidth=1.7;
   if(['hihat','openhat','ride','crash','rimshot'].includes(hit.instrument)){c.beginPath();c.moveTo(x-4,y-4);c.lineTo(x+4,y+4);c.moveTo(x+4,y-4);c.lineTo(x-4,y+4);c.stroke();}
   else{c.beginPath();c.ellipse(x,y,5,3.5,-.3,0,Math.PI*2);c.fill();}
   if(hit.instrument==='openhat'){c.beginPath();c.arc(x,y-9,3,0,Math.PI*2);c.stroke();}
   if(hit.accent){c.font='bold 14px Arial';c.fillText('>',x-4,y-9);}
   if(options.showSticking&&hit.sticking){c.font='bold 10px Arial';c.fillText(hit.sticking,x-3,y+17);}
   if(hit.ghost){c.font='10px Arial';c.fillText('( )',x-7,y+8);}
  }
 }else{
  const active=[...new Set(bar.hits.map(hit=>hit.instrument))],lanes=active.length?active:['kick','snare','hihat'];
  const rowGap=Math.min(34,190/lanes.length),startY=70;
  lanes.forEach((voice,index)=>{const y=startY+index*rowGap;c.strokeStyle='#d7d1c7';c.lineWidth=1;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.fillStyle='#50534c';c.font='bold 10px Arial';c.fillText(song.voiceLabels?.[voice]??voice,18,y+3,Math.max(20,left-21));
   bar.hits.filter(hit=>hit.instrument===voice).forEach(hit=>{const x=xAt(hit.beat);c.beginPath();c.arc(x,y,4,0,Math.PI*2);if(hit.ghost)c.stroke();else c.fill();if(hit.accent){c.font='bold 11px Arial';c.fillText('>',x-3,y-7);}});
  });
 }
 if(cursor?.barIndex===barIndex){const x=xAt(cursor.fraction*bar.beats);c.save();c.strokeStyle='#d03b2d';c.lineWidth=2;c.setLineDash([4,3]);c.beginPath();c.moveTo(x,53);c.lineTo(x,258);c.stroke();c.restore();}
 if(view==='staff'&&(review?.events?.length||review?.extras?.length)){
  const mark=(beat:number,instrument:AttemptEventTiming['instrument'],kind:'missed'|'early'|'late'|'clean'|'extra')=>{const x=xAt(beat),y=156+notationStaffPosition(instrument,options)*5-(kind==='extra'?13:0),color=kind==='missed'?'#b42318':kind==='early'?'#1759a6':kind==='late'?'#a34b08':kind==='extra'?'#7c3aed':'#157347';c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;c.beginPath();if(kind==='extra'){c.moveTo(x,y-4);c.lineTo(x+4,y);c.lineTo(x,y+4);c.lineTo(x-4,y);c.closePath();c.fill();}else{c.arc(x,y,6,0,Math.PI*2);c.stroke();if(kind==='missed'){c.beginPath();c.moveTo(x-3,y-3);c.lineTo(x+3,y+3);c.moveTo(x+3,y-3);c.lineTo(x-3,y+3);c.stroke();}else if(kind==='early'||kind==='late'){c.font='bold 10px Arial';c.fillText(kind==='early'?'←':'→',x-4,y+3);}}};
  for(const event of review?.events??[])if(event.bar===barIndex+1)mark(event.beat,event.instrument,event.offsetMs===null?'missed':Math.abs(event.offsetMs)<=50?'clean':event.offsetMs<0?'early':'late');
  for(const event of review?.extras??[])if(event.bar===barIndex+1)mark(event.beat,event.instrument,'extra');
 }
 c.fillStyle='#50534c';c.font='11px Arial';c.fillText(`${bar.beats} beats · ${bar.subdivision} subdivision · ${bar.hits.length} hits`,18,286);
 return {canvas,measures:[{...measure,x:measure.x*dpr,y:measure.y*dpr,width:measure.width*dpr,height:measure.height*dpr,hitStart:measure.hitStart!*dpr,hitWidth:measure.hitWidth!*dpr}]};
}
