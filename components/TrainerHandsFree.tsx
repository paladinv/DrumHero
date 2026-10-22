"use client";
import { useEffect, useEffectEvent, useState } from 'react';
export function TrainerHandsFree({ onToggle, onRepeat, onMark }: { onToggle: () => void; onRepeat: () => void; onMark: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const dispatch = useEffectEvent((code: string) => { if (code === 'F8') onToggle(); if (code === 'F9') onRepeat(); if (code === 'F10') onMark(); });
  useEffect(() => {
    if (!enabled) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['F8', 'F9', 'F10'].includes(event.code) || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      event.preventDefault(); dispatch(event.code);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [enabled]);
  return <details className="trainer-hands-free"><summary>Hands-free controls</summary><label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enable F8–F10 shortcuts</label><p>Use your keyboard or a USB/Bluetooth keyboard pedal configured to send F8, F9, and F10. Enable again each visit.</p><div className="transport"><button type="button" onClick={onToggle}>Start / pause / resume · F8</button><button type="button" onClick={onRepeat}>Repeat round · F9</button><button type="button" onClick={onMark}>Mark needs work · F10</button></div></details>;
}
