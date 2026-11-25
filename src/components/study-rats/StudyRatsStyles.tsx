/** Estilos locais do Study Rats v4 — usa SOMENTE tokens do design system do Una Vox
 *  (--surface, --surface-2, --border, --primary, --accent, --muted-foreground, --foreground, --background). */
const CSS = `
.srx-card { background: var(--surface); border: 1px solid var(--border); border-radius: 1.5rem; }
.srx-hero { background: radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--primary) 85%, transparent), transparent 60%), linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 55%, var(--background))); border-radius: 1.5rem; box-shadow: 0 20px 50px -25px var(--primary); }
.srx-ring { padding: 2.5px; border-radius: 999px; background: conic-gradient(from 210deg, var(--accent), var(--primary), var(--accent)); }
.srx-ring[data-seen="true"] { background: var(--border); }
.srx-ring > * { border: 2.5px solid var(--background); border-radius: 999px; }
.srx-chip { display:inline-flex; align-items:center; gap:.3rem; font-size:.72rem; font-weight:600; padding:.2rem .55rem; border-radius:999px; color: var(--accent); background: color-mix(in oklab, var(--accent) 14%, transparent); }
.srx-badge { display:inline-flex; align-items:center; gap:.3rem; font-size:.72rem; font-weight:700; padding:.3rem .6rem; border-radius:999px; color: var(--foreground); background: color-mix(in oklab, var(--background) 65%, transparent); backdrop-filter: blur(8px); }
.srx-scroll { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; }
.srx-scroll::-webkit-scrollbar { display:none; }
.srx-scroll > * { scroll-snap-align:center; flex: 0 0 100%; }
.srx-dot { width:6px; height:6px; border-radius:999px; background: color-mix(in oklab, var(--foreground) 35%, transparent); transition: all .2s; }
.srx-dot[data-on="true"] { width:16px; background: var(--accent); }
.srx-icon { transition: transform .15s ease; }
.srx-icon:hover { transform: scale(1.12); }
.srx-icon:active { transform: scale(.9); }
.srx-liked { color: var(--primary); animation: srx-pop .35s ease; }
.srx-saved { color: var(--accent); }
@keyframes srx-pop { 0%{transform:scale(1)} 40%{transform:scale(1.35)} 100%{transform:scale(1)} }
.srx-burst { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; color: var(--foreground); filter: drop-shadow(0 6px 18px var(--primary)); animation: srx-burst .8s ease forwards; }
@keyframes srx-burst { 0%{opacity:0; transform:scale(.3)} 25%{opacity:1; transform:scale(1.15)} 60%{opacity:1; transform:scale(1)} 100%{opacity:0; transform:scale(1.1)} }
.srx-fab { background: linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 60%, var(--primary))); color: var(--accent-foreground); box-shadow: 0 12px 30px -10px var(--accent); }
.srx-overlay { background: color-mix(in oklab, var(--background) 80%, transparent); backdrop-filter: blur(10px); animation: srx-fade .2s ease; }
.srx-sheet { animation: srx-up .25s cubic-bezier(.2,.8,.2,1); }
@keyframes srx-fade { from{opacity:0} } @keyframes srx-up { from{transform:translateY(24px); opacity:0} }
.srx-progress { height:3px; border-radius:999px; background: color-mix(in oklab, var(--foreground) 30%, transparent); overflow:hidden; }
.srx-progress > i { display:block; height:100%; background: var(--foreground); animation: srx-bar 5s linear forwards; }
@keyframes srx-bar { from{width:0} to{width:100%} }
.srx-day { border-radius: 999px; aspect-ratio: 1; display: grid; place-items: center; font-size: .85rem; position: relative; transition: transform .15s ease; }
.srx-day:hover { transform: scale(1.06); }
.srx-thumb { position:absolute; inset:3px; border-radius:999px; overflow:hidden; }
.srx-thumb img { width:100%; height:100%; object-fit:cover; filter: brightness(.7); }
.srx-thumb-num { position:absolute; inset:0; display:grid; place-items:center; font-weight:700; color: var(--foreground); text-shadow:0 1px 3px var(--background); }
.srx-day[data-sel="true"] { box-shadow: 0 0 0 2px var(--accent); }
.srx-count { position:absolute; right:2px; bottom:2px; min-width:16px; height:16px; padding:0 3px; border-radius:999px; font-size:.6rem; font-weight:700; display:grid; place-items:center; background: var(--accent); color: var(--accent-foreground); }
.srx-tile { position:relative; aspect-ratio:1; overflow:hidden; background: var(--surface-2); }
.srx-tile img { width:100%; height:100%; object-fit:cover; transition: transform .3s ease; }
.srx-tile:hover img { transform: scale(1.06); }
.srx-tile .srx-tile-info { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:.4rem; opacity:0; transition: opacity .2s; background: color-mix(in oklab, var(--background) 55%, transparent); color: var(--foreground); font-weight:700; font-size:.85rem; }
.srx-tile:hover .srx-tile-info { opacity:1; }
.srx-seg { background: var(--surface); border:1px solid var(--border); border-radius:999px; padding:3px; display:inline-flex; }
.srx-seg button { border-radius:999px; padding:.35rem .8rem; font-size:.8rem; font-weight:600; color: var(--muted-foreground); display:inline-flex; align-items:center; gap:.35rem; }
.srx-seg button[data-on="true"] { background: var(--accent); color: var(--accent-foreground); }

/* Novos estilos para integração no Calendário (Fase 4) */
.srx-thumb-loader { position:absolute; top:6px; right:6px; }
.srx-thumb-placeholder { position:absolute; top:6px; right:6px; }
`;
export function StudyRatsStyles() {
  return <style href="study-rats-styles" precedence="default">{CSS}</style>;
}
