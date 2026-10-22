"use client";
import { useState } from 'react';
import type { DrumSong,SongNote } from '@/lib/song-library';
import { rehearsalHtml } from '@/lib/song-rehearsal-html';
export function SongRehearsalExport({song,notes}:{song:DrumSong;notes:SongNote[]}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const download=(content:Blob,extension:string)=>{const url=URL.createObjectURL(content),link=document.createElement('a');link.href=url;link.download=`${song.title.replace(/[^a-z0-9]+/gi,'-')||'drum-song'}-rehearsal.${extension}`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const html=()=>{try{download(new Blob([rehearsalHtml(song,notes)],{type:'text/html;charset=utf-8'}),'html');setMessage('Read-only rehearsal view exported. It includes this song’s arrangement, kit setup, notes, and cues, but no recordings or account data.');}catch{setMessage('Could not export the read-only rehearsal view.');}};
 return <section className="song-tool-panel"><h3>Rehearsal sheet and sharing</h3><p>Export staff notation as PDF or a standalone, read-only HTML view you can send to bandmates. Recording audio and account data are not included.</p><div className="song-actions"><button type="button" disabled={busy} onClick={()=>{setBusy(true);void import('@/lib/song-rehearsal-pdf').then(({rehearsalPdf})=>{download(rehearsalPdf(song,notes),'pdf');setMessage('Rehearsal PDF exported.');}).catch(()=>setMessage('Could not create the PDF in this browser.')).finally(()=>setBusy(false));}}>Export rehearsal PDF</button><button type="button" onClick={html}>Export view-only HTML</button></div><p role="status">{message}</p></section>;
}
