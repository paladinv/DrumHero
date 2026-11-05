import { drawNotationPage,notationGeometry,DEFAULT_NOTATION_OPTIONS,type NotationOptions,type NotationView } from './song-builder-notation';
import type { ArrangementBar } from './song-builder';
import type { DrumSong } from './song-library';
export type CompactMeasure={barIndex:number;x:number;y:number;width:number;height:number};
export function compactNotation(song:DrumSong,bars:ArrangementBar[],view:NotationView,page:number,cursor?:{barIndex:number;fraction:number},options:NotationOptions=DEFAULT_NOTATION_OPTIONS){
 const source=drawNotationPage(song,bars,view,page,undefined,options),geometry=notationGeometry(bars,page,options),rows=[...new Set(geometry.map(rect=>rect.y))];
 const bands=rows.map(y=>{const rect=geometry.find(rect=>rect.y===y)!,scale=Math.max(.65,Math.min(1.25,(rect.height-25)/190));return {y,rect,top:view==='staff'?Math.max(y+32,y+16+(rect.height-25)*.54-98*scale):y+32,height:view==='staff'?Math.min(rect.height-32,190*scale):Math.min(rect.height-32,280)};});
 const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=Math.ceil(110+bands.reduce((sum,band)=>sum+band.height+52,0)+58);const context=canvas.getContext('2d');if(!context)throw Error('Notation could not be rendered.');context.fillStyle='#fffdf8';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,1100,105,0,0,1100,105);
 const measures:CompactMeasure[]=[];let targetY=110;
 for(const band of bands){context.drawImage(source,0,band.y,1100,32,0,targetY,1100,32);context.drawImage(source,0,band.top,1100,band.height,0,targetY+32,1100,band.height);for(const rect of geometry.filter(rect=>rect.y===band.y)){measures.push({barIndex:rect.barIndex,x:rect.x,y:targetY,width:rect.width,height:band.height+32});if(cursor?.barIndex===rect.barIndex){context.save();context.strokeStyle='#d03b2d';context.lineWidth=3;const x=rect.x+18+Math.max(0,Math.min(1,cursor.fraction))*(rect.width-38);context.beginPath();context.moveTo(x,targetY+32);context.lineTo(x,targetY+32+band.height);context.stroke();context.restore();}}targetY+=band.height+52;}
 context.fillStyle='#50534c';context.font='14px Arial';context.fillText('> accent · ( ) ghost note · R/L sticking · rests mark silence',48,canvas.height-22);return {canvas,measures};
}
