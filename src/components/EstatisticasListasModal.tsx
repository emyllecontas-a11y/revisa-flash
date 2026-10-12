// src/components/EstatisticasListasModal.tsx
import { useMemo, useState, useCallback } from "react";
import { Lista, ResultadoLista } from "@/lib/listas-types";
import {
  X, TrendingUp, Target, Clock, ListChecks, Award, AlertCircle,
  BarChart3, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  History, Search, Eye, CheckCircle2,
} from "lucide-react";

interface Props {
  listas: Lista[];
  resultados: ResultadoLista[];
  onClose: () => void;
}

type ActiveTab = "estatisticas" | "historico";

export function EstatisticasListasModal({ listas, resultados, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("estatisticas");
  const [historicoPage, setHistoricoPage] = useState(1);
  const [historicoFilter, setHistoricoFilter] = useState("");
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);

  const getListaTitulo = useCallback((listaId: string) => {
    const l = listas.find(l => l.id === listaId);
    return l?.titulo || "Lista removida";
  }, [listas]);

  // ============================================================
  // ESTATÍSTICAS GERAIS
  // ============================================================
  const stats = useMemo(() => {
    const totalListas = listas.length;
    const totalTentativas = resultados.length;
    const totalQuestoes = resultados.reduce((s, r) => s + (r.total_questoes || 0), 0);
    const totalAcertos = resultados.reduce((s, r) => s + (r.acertos || 0), 0);
    const totalErros = resultados.reduce((s, r) => s + (r.erros || 0), 0);
    const mediaGeral = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;
    const melhorResultado = resultados.length > 0
      ? Math.max(...resultados.map(r => r.porcentagem || 0))
      : 0;
    const tempoTotal = resultados.reduce((s, r) => s + (r.tempo_segundos || 0), 0);
    const tempoMedio = totalTentativas > 0 ? Math.round(tempoTotal / totalTentativas / 60) : 0;

    if (totalTentativas === 0) return null;

    return {
      totalListas,
      totalTentativas,
      totalQuestoes,
      totalAcertos,
      totalErros,
      mediaGeral,
      melhorResultado,
      tempoMedio,
    };
  }, [listas, resultados]);

  // ============================================================
  // EVOLUÇÃO
  // ============================================================
  const evolucao = useMemo(() => {
    return [...resultados]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-15)
      .map((r) => ({
        porcentagem: r.porcentagem || 0,
        data: new Date(r.created_at).toLocaleDateString("pt-BR"),
      }));
  }, [resultados]);

  // ============================================================
  // DESEMPENHO POR ÁREA
  // ============================================================
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

  // ============================================================
  // TOP LISTAS
  // ============================================================
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
          titulo: lista?.titulo || "Lista removida",
          porcentagem: d.totalQuestoes > 0 ? Math.round((d.totalAcertos / d.totalQuestoes) * 100) : 0,
          tentativas: d.tentativas,
          totalAcertos: d.totalAcertos,
          totalQuestoes: d.totalQuestoes,
        };
      })
      .sort((a, b) => b.porcentagem - a.porcentagem)
      .slice(0, 5);
  }, [resultados, listas]);

  // ============================================================
  // INSIGHTS
  // ============================================================
  const insights = useMemo(() => {
    if (!stats) return [];
    const items: { icon: React.ReactNode; message: string; type: "positive" | "neutral" | "negative" }[] = [];

    if (stats.mediaGeral >= 70) {
      items.push({
        icon: <Award className="h-4 w-4 text-primary" />,
        message: `Ótimo desempenho! Sua média geral é de ${stats.mediaGeral}% 🎉`,
        type: "positive",
      });
    } else if (stats.mediaGeral >= 50) {
      items.push({
        icon: <Target className="h-4 w-4 text-warning" />,
        message: `Bom desempenho! Sua média geral é de ${stats.mediaGeral}%. Continue praticando! 💪`,
        type: "neutral",
      });
    } else {
      items.push({
        icon: <AlertCircle className="h-4 w-4 text-accent" />,
        message: `Sua média geral é de ${stats.mediaGeral}%. Que tal revisar os conteúdos? 📚`,
        type: "negative",
      });
    }

    if (resultados.length >= 3) {
      const ordenado = [...resultados].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const primeiro = ordenado[0].porcentagem;
      const ultimo = ordenado[ordenado.length - 1].porcentagem;
      const diferenca = ultimo - primeiro;
      if (diferenca > 5) {
        items.push({
          icon: <TrendingUp className="h-4 w-4 text-primary" />,
          message: `Você melhorou ${diferenca}% desde a primeira tentativa! Continue assim! 🚀`,
          type: "positive",
        });
      } else if (diferenca < -5) {
        items.push({
          icon: <AlertCircle className="h-4 w-4 text-accent" />,
          message: `Seu desempenho caiu ${Math.abs(diferenca)}% desde a primeira tentativa. Vale revisar a estratégia.`,
          type: "negative",
        });
      }
    }

    items.push({
      icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
      message: `Você já fez ${stats.totalTentativas} ${stats.totalTentativas === 1 ? "tentativa" : "tentativas"} em listas! Continue assim! 💪`,
      type: "positive",
    });

    return items;
  }, [stats, resultados]);

  // ============================================================
  // COMPARAÇÃO — Listas selecionadas
  // ============================================================
  const toggleComparisonSelection = (listaId: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(listaId)) return prev.filter(id => id !== listaId);
      if (prev.length >= 5) return prev;
      return [...prev, listaId];
    });
  };

  // Um registro por lista (o mais recente)
  const resultadosUnicosPorLista = useMemo(() => {
    const mapa: Record<string, ResultadoLista> = {};
    for (const r of resultados) {
      if (!mapa[r.lista_id]) mapa[r.lista_id] = r;
    }
    return Object.values(mapa);
  }, [resultados]);

  const selectedResults = useMemo(() => {
    return resultadosUnicosPorLista
      .filter(r => selectedForComparison.includes(r.lista_id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [resultadosUnicosPorLista, selectedForComparison]);

  const comparisonInsights = useMemo(() => {
    if (selectedResults.length < 2) return null;
    const melhor = selectedResults.reduce((a, b) => a.porcentagem > b.porcentagem ? a : b);
    const pior = selectedResults.reduce((a, b) => a.porcentagem < b.porcentagem ? a : b);
    const primeiro = selectedResults[0];
    const ultimo = selectedResults[selectedResults.length - 1];
    const diferenca = ultimo.porcentagem - primeiro.porcentagem;

    const items: { icon: React.ReactNode; message: string }[] = [];
    items.push({
      icon: <Award className="h-4 w-4 text-primary" />,
      message: `🏆 Melhor lista: "${getListaTitulo(melhor.lista_id)}" com ${melhor.porcentagem}% de acertos`,
    });
    if (selectedResults.length > 2) {
      items.push({
        icon: <Target className="h-4 w-4 text-warning" />,
        message: `📉 Pior lista: "${getListaTitulo(pior.lista_id)}" com ${pior.porcentagem}% de acertos`,
      });
    }
    if (selectedResults.length >= 2) {
      const evolucao = diferenca > 0 ? `melhorou ${Math.abs(diferenca)}%` : `piorou ${Math.abs(diferenca)}%`;
      items.push({
        icon: diferenca > 0 ? <TrendingUp className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-accent" />,
        message: `📊 Do primeiro para o último resultado, você ${evolucao}`,
      });
    }
    const media = Math.round(selectedResults.reduce((acc, r) => acc + r.porcentagem, 0) / selectedResults.length);
    items.push({
      icon: <BarChart3 className="h-4 w-4 text-primary" />,
      message: `📊 Média das ${selectedResults.length} listas selecionadas: ${media}%`,
    });
    return items;
  }, [selectedResults, getListaTitulo]);

  const comparacaoPorArea = useMemo(() => {
    if (selectedResults.length < 2) return null;
    const areasMap: Record<string, Record<string, number>> = {};

    for (const r of selectedResults) {
      const nomeLista = getListaTitulo(r.lista_id);
      const stats = r.acertos_por_area || {};
      areasMap[nomeLista] = {};
      for (const [area, dados] of Object.entries(stats)) {
        const pct = dados.total > 0 ? Math.round((dados.acertos / dados.total) * 100) : 0;
        areasMap[nomeLista][area] = pct;
      }
    }

    const todasAreas = new Set<string>();
    Object.values(areasMap).forEach(m => Object.keys(m).forEach(a => todasAreas.add(a)));

    return Array.from(todasAreas)
      .map(area => ({
        area,
        listas: areasMap,
      }))
      .sort((a, b) => a.area.localeCompare(b.area));
  }, [selectedResults, getListaTitulo]);

  // ============================================================
  // HISTÓRICO — paginado
  // ============================================================
  const resultadosOrdenados = useMemo(() => {
    return [...resultados].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [resultados]);

  const historicoFiltrado = useMemo(() => {
    if (!historicoFilter.trim()) return resultadosOrdenados;
    const termo = historicoFilter.toLowerCase();
    return resultadosOrdenados.filter(r => {
      const titulo = getListaTitulo(r.lista_id).toLowerCase();
      return titulo.includes(termo);
    });
  }, [resultadosOrdenados, historicoFilter, getListaTitulo]);

  const ITENS_POR_PAGINA = 10;
  const totalPaginas = Math.max(1, Math.ceil(historicoFiltrado.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(historicoPage, totalPaginas);
  const historicoPaginado = historicoFiltrado.slice(
    (paginaAtual - 1) * ITENS_POR_PAGINA,
    paginaAtual * ITENS_POR_PAGINA
  );

  const irParaPagina = (p: number) => {
    setHistoricoPage(Math.max(1, Math.min(p, totalPaginas)));
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl font-semibold">📊 Estatísticas de Listas</h2>
            <p className="text-sm text-foreground/50">Análise completa do seu desempenho</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-abas */}
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("estatisticas")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "estatisticas"
                ? "border-primary text-primary"
                : "border-transparent text-foreground/50 hover:text-foreground"
            }`}
          >
            📊 Estatísticas
          </button>
          <button
            onClick={() => setActiveTab("historico")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "historico"
                ? "border-primary text-primary"
                : "border-transparent text-foreground/50 hover:text-foreground"
            }`}
          >
            📋 Histórico ({resultados.length})
          </button>
        </div>

        {/* ===== SUB-ABA: ESTATÍSTICAS ===== */}
        {activeTab === "estatisticas" && stats && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiBox label="Listas" value={stats.totalListas} icon={<ListChecks className="h-3.5 w-3.5" />} />
              <KpiBox label="Média geral" value={`${stats.mediaGeral}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} accent />
              <KpiBox label="Melhor resultado" value={`${stats.melhorResultado}%`} icon={<Award className="h-3.5 w-3.5" />} />
              <KpiBox label="Tempo médio" value={`${stats.tempoMedio}min`} icon={<Clock className="h-3.5 w-3.5" />} />
            </div>

            {/* Comparar listas */}
            {resultadosUnicosPorLista.length >= 2 && (
              <section className="mb-4 rf-card p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setComparisonExpanded(!comparisonExpanded)}
                    className="flex items-center gap-2"
                  >
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-sm font-semibold">Comparar listas</h3>
                    <span className="text-xs text-foreground/40">
                      {selectedForComparison.length > 0
                        ? `(${selectedForComparison.length} selecionadas)`
                        : "(selecione 2-5 listas)"}
                    </span>
                  </button>
                  <button
                    onClick={() => setComparisonExpanded(!comparisonExpanded)}
                    className="text-foreground/40 hover:text-foreground transition-colors"
                  >
                    {comparisonExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                {comparisonExpanded && (
                  <div className="mt-4">
                    <div className="mb-4 flex flex-wrap gap-2">
                      {resultadosUnicosPorLista
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((r) => {
                          const isSelected = selectedForComparison.includes(r.lista_id);
                          const titulo = getListaTitulo(r.lista_id);
                          return (
                            <button
                              key={r.lista_id}
                              onClick={() => toggleComparisonSelection(r.lista_id)}
                              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                isSelected
                                  ? "bg-primary/15 text-primary border border-primary/30"
                                  : "bg-surface border border-border text-foreground/60 hover:bg-surface-2"
                              }`}
                            >
                              <span className={`h-2 w-2 rounded-full ${isSelected ? "bg-primary" : "bg-foreground/20"}`} />
                              {titulo} ({r.porcentagem}%)
                            </button>
                          );
                        })}
                    </div>

                    {selectedResults.length >= 2 && (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 text-foreground/40 font-medium">Métrica</th>
                                {selectedResults.map((r) => (
                                  <th key={r.lista_id} className="text-center py-2 px-3 text-foreground/40 font-medium">
                                    {getListaTitulo(r.lista_id)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3 text-foreground/60">Data</td>
                                {selectedResults.map((r) => (
                                  <td key={r.lista_id} className="text-center py-2 px-3 text-foreground/40">
                                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3 text-foreground/60">Acertos</td>
                                {selectedResults.map((r) => (
                                  <td key={r.lista_id} className="text-center py-2 px-3 font-medium">
                                    {r.acertos}/{r.total_questoes}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3 text-foreground/60">Porcentagem</td>
                                {selectedResults.map((r) => (
                                  <td key={r.lista_id} className="text-center py-2 px-3 font-semibold">
                                    <span className={
                                      r.porcentagem >= 70 ? "text-primary" :
                                      r.porcentagem >= 50 ? "text-warning" : "text-accent"
                                    }>
                                      {r.porcentagem}%
                                    </span>
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3 text-foreground/60">Tempo</td>
                                {selectedResults.map((r) => (
                                  <td key={r.lista_id} className="text-center py-2 px-3 text-foreground/40">
                                    {Math.floor(r.tempo_segundos / 60)}min
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="py-2 px-3 text-foreground/60">Status</td>
                                {selectedResults.map((r) => {
                                  const isMelhor = r.porcentagem === Math.max(...selectedResults.map(s => s.porcentagem));
                                  const isPior = r.porcentagem === Math.min(...selectedResults.map(s => s.porcentagem));
                                  return (
                                    <td key={r.lista_id} className="text-center py-2 px-3">
                                      {isMelhor && <span className="text-primary text-xs font-medium">🏆 Melhor</span>}
                                      {isPior && selectedResults.length > 2 && <span className="text-accent text-xs font-medium">📉 Pior</span>}
                                      {!isMelhor && !isPior && <span className="text-foreground/30 text-xs">—</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {comparisonInsights && (
                          <div className="mt-4 space-y-1.5">
                            {comparisonInsights.map((item, index) => (
                              <div key={index} className="flex items-start gap-2 rounded-lg bg-white/5 p-2 text-xs">
                                {item.icon}
                                <span className="text-foreground/80">{item.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {comparacaoPorArea && comparacaoPorArea.length > 0 && (
                          <div className="mt-4">
                            <h4 className="mb-2 text-xs font-semibold text-foreground/70">📊 Comparação por área</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border">
                                    <th className="text-left py-1.5 px-2 text-foreground/40 font-medium">Área</th>
                                    {selectedResults.map((r) => (
                                      <th key={r.lista_id} className="text-center py-1.5 px-2 text-foreground/40 font-medium">
                                        {getListaTitulo(r.lista_id)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {comparacaoPorArea.map((item) => (
                                    <tr key={item.area} className="border-b border-border/40">
                                      <td className="py-1.5 px-2 text-foreground/70">{item.area}</td>
                                      {selectedResults.map((r) => {
                                        const simNome = getListaTitulo(r.lista_id);
                                        const pct = item.listas[simNome]?.[item.area] ?? 0;
                                        return (
                                          <td key={r.lista_id} className="text-center py-1.5 px-2">
                                            <span className={
                                              pct >= 70 ? "text-primary" :
                                              pct >= 50 ? "text-warning" : "text-accent"
                                            }>
                                              {pct}%
                                            </span>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Evolução + Áreas lado a lado */}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rf-card p-4">
                <h3 className="mb-3 font-display text-sm font-semibold">
                  📈 Evolução (últimas {evolucao.length} {evolucao.length === 1 ? "tentativa" : "tentativas"})
                </h3>
                {evolucao.length > 0 ? (
                  <div className="space-y-2">
                    {evolucao.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[10px] text-foreground/40 w-16 tabular-nums">{item.data}</span>
                        <div className="flex-1 h-6 relative">
                          <div
                            className="h-full rounded-full bg-primary/20 relative overflow-hidden"
                            style={{ width: `${item.porcentagem}%` }}
                          >
                            <div
                              className={`h-full rounded-md ${
                                item.porcentagem >= 70 ? "bg-primary" :
                                item.porcentagem >= 50 ? "bg-warning" : "bg-accent"
                              }`}
                              style={{ width: `${item.porcentagem}%` }}
                            />
                          </div>
                          <span className="absolute right-0 top-0 text-xs font-medium tabular-nums">
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

              <section className="rf-card p-4">
                <h3 className="mb-3 font-display text-sm font-semibold">📊 Desempenho por área</h3>
                {areas.length > 0 ? (
                  <div className="space-y-2">
                    {areas.slice(0, 6).map((a, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{a.area}</span>
                          <span className="text-foreground/50">{a.acertos}/{a.total} ({a.porcentagem}%)</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full ${
                              a.porcentagem >= 70 ? "bg-primary" :
                              a.porcentagem >= 50 ? "bg-warning" : "bg-accent"
                            }`}
                            style={{ width: `${a.porcentagem}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {areas.length > 6 && (
                      <p className="text-center text-[10px] text-foreground/40 pt-2">+{areas.length - 6} outras áreas</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/40 text-center py-4">
                    Sem dados de área ainda. As estatísticas por área aparecem após novas tentativas.
                  </p>
                )}
              </section>
            </div>

            {/* Insights */}
            <section className="mt-4 rf-card p-4">
              <h3 className="mb-3 font-display text-sm font-semibold">💡 Insights</h3>
              <div className="space-y-2">
                {insights.map((insight, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      insight.type === "positive" ? "border-primary/20 bg-primary/5" :
                      insight.type === "negative" ? "border-accent/20 bg-accent/5" :
                      "border-warning/20 bg-warning/5"
                    }`}
                  >
                    {insight.icon}
                    <p className="text-sm">{insight.message}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Top listas */}
            {topListas.length > 0 && (
              <section className="mt-4 rf-card p-4">
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
                          {t.tentativas} {t.tentativas === 1 ? "tentativa" : "tentativas"} · {t.totalAcertos}/{t.totalQuestoes} acertos
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.porcentagem >= 70 ? "bg-primary/15 text-primary" :
                        t.porcentagem >= 50 ? "bg-warning/15 text-warning" :
                        "bg-accent/15 text-accent"
                      }`}>
                        {t.porcentagem}%
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "estatisticas" && !stats && (
          <div className="text-center py-12">
            <TrendingUp className="mx-auto h-12 w-12 text-foreground/20" />
            <p className="mt-4 text-foreground/50">Finalize ao menos uma lista para ver as estatísticas.</p>
          </div>
        )}

        {/* ===== SUB-ABA: HISTÓRICO ===== */}
        {activeTab === "historico" && (
          <div>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                <input
                  type="text"
                  placeholder="Buscar por título da lista..."
                  value={historicoFilter}
                  onChange={(e) => { setHistoricoFilter(e.target.value); setHistoricoPage(1); }}
                  className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                />
              </div>
            </div>

            {resultados.length === 0 ? (
              <div className="text-center py-8">
                <History className="mx-auto h-12 w-12 text-foreground/20" />
                <p className="mt-4 text-foreground/50">Nenhuma lista concluída ainda.</p>
              </div>
            ) : historicoFiltrado.length === 0 ? (
              <div className="text-center py-8">
                <Search className="mx-auto h-12 w-12 text-foreground/20" />
                <p className="mt-4 text-foreground/50">Nenhum resultado para "{historicoFilter}".</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {historicoPaginado.map((r) => {
                    const pct = r.porcentagem || 0;
                    const tempoMin = Math.floor(r.tempo_segundos / 60);
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          onClose();
                          window.location.href = `/listas/${r.lista_id}`;
                        }}
                        className="w-full rf-card hover:bg-surface/50 transition-colors p-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{getListaTitulo(r.lista_id)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                pct >= 70 ? "bg-primary/15 text-primary" :
                                pct >= 50 ? "bg-warning/15 text-warning" :
                                "bg-accent/15 text-accent"
                              }`}>
                                {pct}%
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground/40">
                              <span>{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                              <span>•</span>
                              <span>{r.acertos}/{r.total_questoes} acertos</span>
                              <span>•</span>
                              <span>{tempoMin}min</span>
                            </div>
                          </div>
                          <Eye className="h-4 w-4 text-foreground/30 shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {totalPaginas > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-foreground/40">
                      Mostrando {((paginaAtual - 1) * ITENS_POR_PAGINA) + 1} - {Math.min(paginaAtual * ITENS_POR_PAGINA, historicoFiltrado.length)} de {historicoFiltrado.length}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => irParaPagina(paginaAtual - 1)}
                        disabled={paginaAtual === 1}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface text-foreground/60 hover:bg-surface-2 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => irParaPagina(paginaAtual + 1)}
                        disabled={paginaAtual === totalPaginas}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface text-foreground/60 hover:bg-surface-2 disabled:opacity-40"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
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
      <div className={["mt-1 font-display text-xl font-semibold tabular-nums", accent ? "text-accent" : "text-foreground"].join(" ")}>
        {value}
      </div>
    </div>
  );
}