// src/components/SubtopicoCard.tsx
// Card de subtópicos que aparece dentro do detalhe de um tópico.
// Mostra a lista com status (editável inline) e botão "Gerenciar" (abre o modal).
// Correção mobile: padding responsivo, header com flex-wrap, min-w-0.

import { useState, useEffect, useCallback } from "react";
import { Plus, Settings, Loader2 } from "lucide-react";
import {
  listarSubtopicos,
  atualizarStatusSubtopico,
  type Subtopico,
  type SubtopicoStatus,
} from "@/services/subtopicService";
import { getDb } from "@/lib/db";
import { SubtopicoModal } from "@/components/SubtopicoModal";
import { useToast } from "@/hooks/useToast";

const STATUS_OPTS: { value: SubtopicoStatus; label: string }[] = [
  { value: "nao_estudado", label: "Não iniciado" },
  { value: "estudando", label: "Estudando" },
  { value: "revisado", label: "Revisado" },
  { value: "dominado", label: "Dominado" },
];

const STATUS_COLOR: Record<SubtopicoStatus, string> = {
  nao_estudado: "text-foreground/60",
  estudando: "text-primary",
  revisado: "text-accent",
  dominado: "text-success",
};

export function SubtopicoCard({
  topicoId,
  userId,
}: {
  topicoId: string;
  userId: string | null;
}) {
  const toast = useToast();
  const [subtopicos, setSubtopicos] = useState<Subtopico[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerenciando, setGerenciando] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await listarSubtopicos(topicoId, userId);
      setSubtopicos(list);
    } catch (e) {
      console.error("Erro ao carregar subtópicos:", e);
    } finally {
      setLoading(false);
    }
  }, [topicoId, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Escuta mudanças do RxDB (sync de outro aparelho, por ex.)
  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const db = await getDb();
        if (cancelled || !db.collections?.subtopicos) return;
        sub = db.collections.subtopicos.$.subscribe(() => {
          reload();
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [reload]);

  const handleChangeStatus = async (id: string, status: SubtopicoStatus) => {
    setChangingId(id);
    try {
      await atualizarStatusSubtopico(id, status);
      await reload();
      if (status === "estudando") {
        toast.success("Subtópico marcado como 'estudando'. Revisão D1 criada.");
      } else if (status === "revisado") {
        toast.success("Subtópico revisado. Revisões D1-D5 agendadas.");
      } else if (status === "dominado") {
        toast.success("Subtópico dominado!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível atualizar o status.");
    } finally {
      setChangingId(null);
    }
  };

  const dominados = subtopicos.filter((s) => s.status === "dominado").length;

  return (
    <>
      {/* MUDANÇA: p-4 no mobile, p-6 a partir de sm + min-w-0 */}
      <div className="rf-card min-w-0 p-4 sm:p-6">
        {/* MUDANÇA: flex-wrap + gap para o botão "Gerenciar" descer quando faltar espaço */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs font-medium uppercase tracking-widest text-foreground/40">
              Subtópicos
            </h3>
            <p className="mt-1 text-xs text-foreground/55">
              {subtopicos.length > 0
                ? `${dominados}/${subtopicos.length} dominados`
                : "Divida este tópico em partes menores"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGerenciando(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" /> Gerenciar
          </button>
        </header>

        {loading ? (
          <p className="py-4 text-center text-xs text-foreground/40">Carregando…</p>
        ) : subtopicos.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-foreground/55 mb-3">Nenhum subtópico ainda.</p>
            <button
              onClick={() => setGerenciando(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar subtópicos
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {subtopicos.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="min-w-0 flex-1 text-sm font-medium truncate">
                  {s.name}
                </div>
                {changingId === s.id && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground/40" />
                )}
                <select
                  value={s.status}
                  onChange={(e) =>
                    handleChangeStatus(s.id, e.target.value as SubtopicoStatus)
                  }
                  disabled={changingId === s.id}
                  className={`shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-medium outline-none focus:border-primary disabled:opacity-50 ${STATUS_COLOR[s.status]}`}
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      {gerenciando && userId && (
        <SubtopicoModal
          topicoId={topicoId}
          subtopicos={subtopicos}
          userId={userId}
          onClose={() => setGerenciando(false)}
          onChanged={reload}
        />
      )}
    </>
  );
}