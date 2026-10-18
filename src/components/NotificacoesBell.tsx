// src/components/NotificacoesBell.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, X, Check, Users, Folder, ClipboardList, FileStack,
} from "lucide-react";
import { useNotificacoes, type Notificacao } from "@/hooks/useNotificacoes";

export function NotificacoesBell({ userId }: { userId: string | undefined }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { notificacoes, lidas, naoLidasCount, marcarComoLida, marcarTodasComoLidas } =
    useNotificacoes(userId);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fecha com Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const naoLidas = notificacoes.filter((n) => !lidas.has(n.id));

  const handleClick = (n: Notificacao) => {
    marcarComoLida(n.id);
    setOpen(false);
    if (n.route) navigate(n.route);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-lg border border-border bg-surface p-1.5 text-foreground/60 hover:bg-surface-2 transition-colors"
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell className="h-3.5 w-3.5" />
        {naoLidasCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {naoLidasCount > 99 ? "99+" : naoLidasCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-bold">Notificações</h3>
            {naoLidasCount > 0 && (
              <button
                onClick={marcarTodasComoLidas}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {naoLidas.length === 0 ? (
              <div className="py-10 text-center">
                <Check className="mx-auto h-8 w-8 text-primary/40" />
                <p className="mt-2 text-sm text-foreground/50">Tudo em dia!</p>
              </div>
            ) : (
              naoLidas.map((n) => (
                <div
                  key={n.id}
                  className="group flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <button
                    onClick={() => handleClick(n)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <div className="mt-0.5 shrink-0 text-primary">
                      {n.tipo === "convite" ? <Users className="h-4 w-4" /> :
                       n.tipo === "discipline" ? <Folder className="h-4 w-4" /> :
                       n.tipo === "lista" ? <ClipboardList className="h-4 w-4" /> :
                       <FileStack className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{n.titulo}</p>
                      {n.descricao && (
                        <p className="mt-0.5 truncate text-xs text-foreground/60">{n.descricao}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-foreground/40">
                        {formatarTempoRelativo(n.timestamp)}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => marcarComoLida(n.id)}
                    className="shrink-0 rounded-md p-1 text-foreground/30 opacity-0 transition-opacity hover:bg-surface hover:text-foreground group-hover:opacity-100"
                    title="Marcar como lida"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate("/comunidade");
            }}
            className="w-full border-t border-border px-4 py-2.5 text-center text-[11px] font-medium text-primary hover:bg-surface-2"
          >
            Ir para Comunidade
          </button>
        </div>
      )}
    </div>
  );
}

function formatarTempoRelativo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return "agora";
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "agora";
    if (min < 60) return `${min}min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `${dias}d`;
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}