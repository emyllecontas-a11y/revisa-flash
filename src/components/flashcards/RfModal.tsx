import { useEffect, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import "./redesign.css";

/** Moldura visual compartilhada por TODOS os modais de flashcards. Só aparência. */
export function RfModal({
  open, onClose, title, icon, tone, width = "34rem", children, footer,
}: {
  open: boolean; onClose: () => void; title: ReactNode; icon?: ReactNode; tone?: string;
  width?: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="rfm-overlay" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" className="rfm-panel"
        style={{ maxWidth: width, ...(tone ? { "--tone": tone } : {}) } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="rfm-head">
          <h2 className="rfm-title">{icon && <span className="rfm-icon">{icon}</span>}{title}</h2>
          <button className="rfm-close" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        {children}
        {footer && <div className="rfm-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function StatTile({ label, value, icon, tone }: { label: string; value: ReactNode; icon?: ReactNode; tone?: string }) {
  return (
    <div className="rfm-stat" style={tone ? ({ "--tone": tone } as CSSProperties) : undefined}>
      {icon && <span className="rfm-icon mb-3 h-8 w-8">{icon}</span>}
      <p className="rfm-stat__label">{label}</p>
      <p className="rfm-stat__value">{value}</p>
    </div>
  );
}