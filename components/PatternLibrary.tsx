import Link from "next/link";
import type { Groove, Rudiment } from "@/lib/types";

export function PatternLibrary({items,kind}:{items:Array<Groove|Rudiment>;kind:"groove"|"rudiment"}){
  return <section className="card-grid">{items.map((item)=><article className={`card level-${item.level}`} key={item.id}><span className="level-mark">{item.level} · {item.defaultBpm} BPM</span><h3>{item.name}</h3><p>{item.description}</p>{"sticking" in item?<><div className="sticking" aria-label={`Sticking ${item.sticking}`}>{item.sticking}</div><p><strong>Coach:</strong> {item.coaching}</p></>:<><div className="chips"><span className="chip">{item.style}</span><span className="chip">{item.subdivision}th-note grid</span></div><p><strong>Focus:</strong> {item.focus}</p></>}<Link className="button" href={`/practice?pattern=${item.id}`}>Practice {kind}</Link></article>)}</section>
}

