"use client";
import { useEffect, useState } from 'react';
type Preferences = { motion: boolean; contrast: boolean; spacing: boolean; scale: number };
const defaults: Preferences = { motion: false, contrast: false, spacing: false, scale: 1 };
const key = 'drum-hero:accessibility:v1';
function apply(value: Preferences) {
  const root = document.documentElement;
  root.dataset.reduceMotion = String(value.motion);
  root.dataset.highContrast = String(value.contrast);
  root.dataset.wideSpacing = String(value.spacing);
  root.style.fontSize = `${value.scale * 100}%`;
  window.dispatchEvent(new Event('drum-hero:accessibility-change'));
}
export function AccessibilitySettings() {
  const [value, setValue] = useState(defaults);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const raw = JSON.parse(localStorage.getItem(key) ?? '{}'); const next = { motion: raw?.motion === true, contrast: raw?.contrast === true, spacing: raw?.spacing === true, scale: [1, 1.1, 1.2, 1.3].includes(raw?.scale) ? raw.scale as number : 1 }; setValue(next); apply(next); } catch { /* Defaults remain available. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const update = (next: Preferences) => {
    setValue(next); apply(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setMessage('Display preferences saved on this device.'); } catch { setMessage('Preferences apply for this visit; storage is unavailable.'); }
  };
  return <details className="accessibility-settings site-nav-group"><summary>Accessibility</summary><div className="site-nav-submenu">{([['motion', 'Reduce motion'], ['contrast', 'High contrast'], ['spacing', 'Wider text spacing']] as const).map(([id, label]) => <label key={id}><input type="checkbox" checked={value[id]} onChange={event => update({ ...value, [id]: event.target.checked })} /> {label}</label>)}<label>Text size<select value={value.scale} onChange={event => update({ ...value, scale: Number(event.target.value) })}>{[1, 1.1, 1.2, 1.3].map(scale => <option key={scale} value={scale}>{Math.round(scale * 100)}%</option>)}</select></label><button type="button" onClick={() => update(defaults)}>Reset display</button>{message && <small role="status">{message}</small>}</div></details>;
}
