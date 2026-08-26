import type { Metadata } from "next";
export const metadata:Metadata={title:"Kit Guide"};
const voices=[
  ["Kick","Space","The low foundation. Let the beater return instead of burying tension in your ankle."],
  ["Snare","F","The backbeat voice. Aim for a centered stroke and let the stick rebound."],
  ["Hi-hat","J","Your timekeeper. Use small motions and listen for even spacing."],
  ["Tom","K","The melodic drum voice. Move from the shoulder without reaching."],
  ["Crash","L","An arrival point, not constant punctuation. Pair it with the kick for impact."]
];
export default function KitPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Your instrument</span><h1>Set up to play <span>for years.</span></h1><p>A comfortable kit makes good motion easier. These same five voices map directly to the Practice Pad.</p></header><section className="card-grid">{voices.map(([name,key,copy],index)=><article className="card" key={name}><span className="number">0{index+1}</span><h3>{name}</h3><span className="chip">Keyboard: {key}</span><p>{copy}</p></article>)}</section><div className="section-heading"><div><span className="eyebrow">Before you play</span><h2>Comfort is technique.</h2></div></div><section className="card-grid"><article className="card"><h3>Seat & reach</h3><p>Sit high enough that your hips are slightly above your knees. Bring the kit to you; never twist or reach for a drum.</p></article><article className="card"><h3>Relaxed motion</h3><p>Use the minimum grip needed to guide the stick. Stop if you feel sharp pain, numbness, or persistent tension.</p></article><article className="card"><h3>Protect your hearing</h3><p>Acoustic drums can damage hearing quickly. Use musician earplugs or isolation headphones and keep practice volume controlled.</p></article></section></main>}

