/**
 * Estilos locais do novo visual de Aulas (mesmo padrão do AulasStyles do app:
 * <style> com precedence, usando só tokens do design system do RevisaFlash).
 */
const CSS = `
[data-tone="laranja"] { --au-tone: var(--primary); }
[data-tone="rosa"]    { --au-tone: var(--accent); }
[data-tone="menta"]   { --au-tone: oklch(0.7 0.1 175); }
[data-tone="lavanda"] { --au-tone: oklch(0.68 0.11 295); }

.rfx-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  transition: transform .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.rfx-card-hover:hover {
  background: var(--surface-2);
  transform: translateY(-2px);
  border-color: color-mix(in oklab, var(--au-tone, var(--primary)) 55%, var(--border));
  box-shadow: 0 5px 0 0 color-mix(in oklab, var(--au-tone, var(--primary)) 45%, var(--lip-shadow));
}
.rfx-tone-icon { background: color-mix(in oklab, var(--au-tone) 18%, transparent); color: var(--au-tone); }
.rfx-tone-text { color: var(--au-tone); }
.rfx-tone-bar  { background: var(--au-tone); }
.rfx-track { background: color-mix(in oklab, var(--foreground) 10%, transparent); }
.rfx-progress { background: var(--gradient-progress); }

.rfx-badge-novo, .rfx-badge-baixado {
  font-size: .68rem; font-weight: 700; padding: .15rem .5rem; border-radius: .4rem;
  background: var(--accent); color: var(--accent-foreground); letter-spacing: .02em;
}
.rfx-badge-baixado { background: color-mix(in oklab, var(--accent) 85%, var(--primary)); }

.rfx-check {
  width: 1.5rem; height: 1.5rem; border-radius: .45rem;
  border: 2px solid var(--input); background: var(--background);
  display: grid; place-items: center; transition: all .15s ease;
}
.rfx-check[data-checked="true"] { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }

.rfx-topbar { position: relative; height: 4px; background: var(--border); border-radius: 999px; overflow: hidden; }
.rfx-topbar > span { position: absolute; inset: 0 auto 0 0; background: var(--gradient-progress); border-radius: 999px; }

.rfx-player {
  border-radius: 1.5rem; overflow: hidden;
  box-shadow: 0 6px 0 0 var(--lip-shadow), var(--shadow-elevated);
  background:
    radial-gradient(80% 90% at 15% 10%, color-mix(in oklab, var(--accent) 45%, transparent), transparent 60%),
    radial-gradient(70% 80% at 90% 100%, color-mix(in oklab, var(--primary) 40%, transparent), transparent 60%),
    linear-gradient(160deg, var(--surface-2), var(--background));
}
.rfx-play {
  background: var(--primary); color: var(--primary-foreground);
  box-shadow: 0 4px 0 0 var(--lip-shadow), 0 0 0 10px color-mix(in oklab, var(--primary) 18%, transparent);
  transition: transform .2s ease, box-shadow .2s ease;
}
.rfx-play:hover { transform: scale(1.06); box-shadow: 0 4px 0 0 var(--lip-shadow), 0 0 0 16px color-mix(in oklab, var(--primary) 14%, transparent); }

.rfx-video { border: 1px solid var(--border); background: var(--surface); border-radius: 1rem; transition: all .15s ease; }
.rfx-video:hover { background: var(--surface-2); }
.rfx-video[data-active="true"] {
  background: var(--primary); color: var(--primary-foreground); border-color: var(--primary);
  box-shadow: 0 4px 0 0 var(--lip-shadow);
}
.rfx-video[data-active="true"] .rfx-video-sub { color: color-mix(in oklab, var(--primary-foreground) 75%, transparent); }

.rfx-action { position: relative; }
.rfx-action:hover .rfx-action-icon { transform: translateY(-2px) rotate(-4deg); }
.rfx-action-icon { transition: transform .2s ease; }

.rfx-group-line { background: linear-gradient(90deg, var(--border), transparent); height: 1px; flex: 1; }

@keyframes rfx-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.rfx-in { animation: rfx-in .35s ease both; }
@media (prefers-reduced-motion: reduce) { .rfx-in { animation: none } .rfx-card, .rfx-play { transition: none } }
`;

export function AulasRedesignStyles() {
  return (
    <style href="rf-aulas-redesign" precedence="default">
      {CSS}
    </style>
  );
}
