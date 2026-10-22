import { normalizePresets,type PracticePreset,type PlayerSettings } from './song-library-next';
export const recoveryStorageKey=(key:string)=>`drum-hero:song-round:v1:${key}`;
export type RecoveryPoint={version:1;signature:string;barIndex:number;savedAt:string;settings:PlayerSettings;preset?:PracticePreset};
export function timelineSignature(value:unknown){const text=JSON.stringify(value);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return `${text.length}:${hash>>>0}`;}
export function readRecovery(key:string):RecoveryPoint|null{try{const item=JSON.parse(localStorage.getItem(recoveryStorageKey(key))||'null');if(item?.version!==1||typeof item.signature!=='string'||!Number.isInteger(item.barIndex)||item.barIndex<0||!Number.isFinite(Date.parse(item.savedAt)))return null;return {...item,preset:normalizePresets(item.preset?[item.preset]:[])[0]};}catch{return null;}}
