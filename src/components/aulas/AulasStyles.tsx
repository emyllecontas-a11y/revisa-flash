/**
 * Estilos locais da página de aulas (mesmo padrão de BlocoFixacao: <style> com precedence).
 * Usa apenas tokens já existentes no design system do RevisaFlash.
 */
const AULAS_CSS = `
.rf-au-hand { font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive; line-height: 1; }

.rf-au-card[data-tone="laranja"] { --au-tone: oklch(0.72 0.19 50); }
.rf-au-card[data-tone="rosa"]    { --au-tone: oklch(0.65 0.23 0); }
.rf-au-card[data-tone="menta"]   { --au-tone: oklch(0.7 0.1 175); }
.rf-au-card[data-tone="lavanda"] { --au-tone: oklch(0.68 0.11 295); }

.rf-au-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  transition: transform .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.rf-au-card:hover { background: var(--surface-2); transform: translateY(-1px); border-color: color-mix(in oklab, var(--au-tone) 35%, var(--border)); }
.rf-au-card[data-active="true"] {
  background: color-mix(in oklab, var(--au-tone) 12%, var(--surface));
  border-color: color-mix(in oklab, var(--au-tone) 60%, transparent);
  box-shadow: 0 5px 0 0 color-mix(in oklab, var(--au-tone) 55%, var(--lip-shadow));
}
.rf-au-icon { background: color-mix(in oklab, var(--au-tone) 18%, transparent); color: var(--au-tone); }
.rf-au-card[data-active="true"] .rf-au-icon { background: var(--au-tone); color: var(--primary-foreground); }
.rf-au-bar { background: color-mix(in oklab, var(--au-tone) 85%, transparent); }

.rf-au-player {
  border-radius: 1.5rem;
  box-shadow: 0 6px 0 0 var(--lip-shadow), var(--shadow-elevated);
  background:
    radial-gradient(80% 90% at 15% 10%, color-mix(in oklab, var(--accent) 45%, transparent), transparent 60%),
    radial-gradient(70% 80% at 90% 100%, color-mix(in oklab, var(--primary) 40%, transparent), transparent 60%),
    linear-gradient(160deg, var(--surface-2), var(--background));
}
.rf-au-grid {
  background-image:
    linear-gradient(to right, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
}
.rf-au-scrim { background: linear-gradient(to top, color-mix(in oklab, var(--background) 92%, transparent), transparent); }
.rf-au-play {
  background: var(--primary); color: var(--primary-foreground);
  box-shadow: 0 4px 0 0 var(--lip-shadow), 0 0 0 10px color-mix(in oklab, var(--primary) 18%, transparent);
  transition: transform .2s ease, box-shadow .2s ease;
}
.rf-au-play:hover { transform: scale(1.06); box-shadow: 0 4px 0 0 var(--lip-shadow), 0 0 0 16px color-mix(in oklab, var(--primary) 14%, transparent); }
.rf-au-empty {
  border-radius: 1.5rem;
  background:
    repeating-linear-gradient(180deg, transparent 0 31px, color-mix(in oklab, var(--foreground) 6%, transparent) 31px 32px),
    var(--surface);
  border: 1px dashed var(--border);
}
@keyframes rf-au-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
.rf-au-float { animation: rf-au-float 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .rf-au-float { animation: none; } .rf-au-card, .rf-au-play { transition: none; } }
`;

export function AulasStyles() {
  return (
    <style href="rf-aulas" precedence="default">
      {AULAS_CSS}
    </style>
  );
}
