// src/components/EstatisticasListasModal.tsx
import { useMemo } from "react";
import { Lista, ResultadoLista } from "@/lib/listas-types";
import { X, TrendingUp, Target, Clock, ListChecks } from "lucide-react";

interface Props {
  listas: Lista[];
  resultados: ResultadoLista[];
  onClose: () => void;
}

export function EstatisticasListasModal({ listas, resultados, onClose }: Props) {
  const totalListas = listas.length;
  const totalTentativas = resultados.length;
  const totalQuestoes = resultados.reduce((s, r) => s + (r.total_questoes || 0), 0);
  const totalAcertos = resultados.reduce((s, r) => s + (r.acertos || 0), 0);
  const mediaGeral = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;
  const tempoTotal = resultados.reduce((s, r) => s + (r.tempo_segundos || 0), 0);
  const tempoMedio = totalTentativas > 0 ? Math.round(tempoTotal / totalTentativas / 60) : 0;

  const evolucao = useMemo(() => {
    return [...resultados]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-15)
      .map((r) => ({
        porcentagem: r.porcentagem,
        data: new Date(r.created_at).toLocaleDateString('pt-BR'),
      }));
  }, [resultados]);

  const areas = useMemo(() => {
    const mapa: Record<string, { acertos: number; total: number }> = {};
    for (const r of resultados) {
      const stats = r.acertos_por_area || {};
      for (const [area, dados] of Object.entries(stats)) {
        if (!mapa[area]) mapa[area] = { acertos: 0, total: 0 };
        mapa[area].acertos += dados.acertos;
        mapa[area].total += dados.total;
      }
    }
    return Object.entries(mapa)
      .map(([area, d]) => ({
        area,
        acertos: d.acertos,
        total: d.total,
        porcentagem: d.total > 0 ? Math.round((d.acertos / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.porcentagem - a.porcentagem);
  }, [resultados]);

  const topListas = useMemo(() => {
    const porLista: Record<string, { totalAcertos: number; totalQuestoes: number; tentativas: number }> = {};
    for (const r of resultados) {
      if (!porLista[r.lista_id]) porLista[r.lista_id] = { totalAcertos: 0, totalQuestoes: 0, tentativas: 0 };
      porLista[r.lista_id].totalAcertos += r.acertos;
      porLista[r.lista_id].totalQuestoes += r.total_questoes;
      porLista[r.lista_id].tentativas++;
    }
    return Object.entries(porLista)
      .map(([listaId, d]) => {
        const lista = listas.find(l => l.id === listaId);
        return {
          listaId,
          titulo: lista?.titulo || 'Lista removida',
          porcentagem: d.totalQuestoes > 0 ? Math.round((d.totalAcertos / d.totalQuestoes) * 100) : 0,
          tentativas: d.tentativas,
          totalAcertos: d.totalAcertos,
          totalQuestoes: d.totalQuestoes,
        };
      })
      .sort((a, b) => b.porcentagem - a.porcentagem)
      .slice(0, 5);
  }, [resultados, listas]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl font-semibold">📊 Estatísticas de listas</h2>
            <p className="text-sm text-foreground/50">Análise completa do seu desempenho</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiBox label="Listas" value={totalListas} icon={<ListChecks className="h-3.5 w-3.5" />} />
          <KpiBox label="Tentativas" value={totalTentativas} icon={<Target className="h-3.5 w-3.5" />} />
          <KpiBox label="Média geral" value={`${mediaGeral}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} accent />
          <KpiBox label="Tempo médio" value={`${tempoMedio}min`} icon={<Clock className="h-3.5 w-3.5" />} />
        </div>

        <section className="mb-4 rf-card p-4">
          <h3 className="mb-3 font-display text-sm font-semibold">
            📈 Evolução (últimas {evolucao.length} {evolucao.length === 1 ? 'tentativa' : 'tentativas'})
          </h3>
          {evolucao.length > 0 ? (
            <div className="space-y-1.5">
              {evolucao.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-foreground/40 w-16 tabular-nums">{item.data}</span>
                  <div className="flex-1 h-5 relative">
                    <div
                      className={`h-full rounded-md ${
                        item.porcentagem >= 70 ? 'bg-primary' :
                        item.porcentagem >= 50 ? 'bg-warning' :
                        'bg-accent'
                      }`}
                      style={{ width: `${Math.max(item.porcentagem, 2)}%` }}
                    />
                    <span className="absolute right-1 top-0 text-[10px] font-medium tabular-nums leading-5">
                      {item.porcentagem}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-4">Sem tentativas ainda</p>
          )}
        </section>

        <section className="mb-4 rf-card p-4">
          <h3 className="mb-3 font-display text-sm font-semibold">📊 Desempenho por área</h3>
          {areas.length > 0 ? (
            <div className="space-y-2">
              {areas.map((a, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{a.area}</span>
                    <span className="text-foreground/50">{a.acertos}/{a.total} ({a.porcentagem}%)</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${
                        a.porcentagem >= 70 ? 'bg-primary' :
                        a.porcentagem >= 50 ? 'bg-warning' :
                        'bg-accent'
                      }`}
                      style={{ width: `${a.porcentagem}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-4">
              Sem dados de área ainda. As estatísticas por área começam a aparecer após a primeira tentativa com esta melhoria.
            </p>
          )}
        </section>

        {topListas.length > 0 && (
          <section className="rf-card p-4">
            <h3 className="mb-3 font-display text-sm font-semibold">🏆 Top listas</h3>
            <div className="space-y-2">
              {topListas.map((t, i) => (
                <div key={t.listaId} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.titulo}</div>
                    <div className="text-[11px] text-foreground/45">
                      {t.tentativas} {t.tentativas === 1 ? 'tentativa' : 'tentativas'} · {t.totalAcertos}/{t.totalQuestoes} acertos
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    t.porcentagem >= 70 ? 'bg-primary/15 text-primary' :
                    t.porcentagem >= 50 ? 'bg-warning/15 text-warning' :
                    'bg-accent/15 text-accent'
                  }`}>
                    {t.porcentagem}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function KpiBox({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rf-card p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
        {icon} {label}
      </div>
      <div className={["mt-1 font-display text-xl font-semibold tabular-nums", accent ? "text-accent" : "text-foreground"].join(" ")}>{value}</div>
    </div>
  );
}