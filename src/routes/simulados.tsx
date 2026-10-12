// src/routes/simulados.tsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppUser } from "@/contexts/UserContext";
import { AppShell } from "@/components/app-shell";
import { 
  getSimulados, 
  importarSimulado, 
  excluirSimulado,
  buscarResultadosDoUsuario,
  buscarHistoricoCompleto
} from "@/services/simuladoService";
import { useStudy } from "@/contexts/StudyContext";
import { ListasTab } from "@/components/ListasTab";
import {
  Layers, Clock, CheckCircle2, ListChecks, Play, RotateCcw, Upload, FileText,
  X, Loader2, Trash2, Eye, TrendingUp, Target, Award, AlertCircle,
  BarChart3, ChevronDown, ChevronUp, History, Search, FileStack
} from "lucide-react";
import type { Simulado } from "@/lib/simulados-types";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function SimuladosPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const { user } = useAppUser();
  const { records: studyRecords } = useStudy();

  const [mainTab, setMainTab] = useState<'simulados' | 'listas'>('simulados');

  const [simulados, setSimulados] = useState<Simulado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultadosUsuario, setResultadosUsuario] = useState<Record<string, any>>({});
  const [resultadosLista, setResultadosLista] = useState<any[]>([]);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const [excluindo, setExcluindo] = useState<string | null>(null);

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'estatisticas' | 'historico'>('estatisticas');

  const [historicoData, setHistoricoData] = useState<any>({ resultados: [], total: 0 });
  const [historicoPage, setHistoricoPage] = useState(1);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoFilter, setHistoricoFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const simResult = await getSimulados();
      if (simResult.success && simResult.data) {
        setSimulados(simResult.data);
      } else {
        setError(simResult.error || "Erro ao carregar simulados");
      }

      if (user?.id) {
        const resultResult = await buscarResultadosDoUsuario(user.id);
        if (resultResult.success && resultResult.data) {
          const mapa: Record<string, any> = {};
          resultResult.data.forEach((r: any) => {
            mapa[r.simulado_id] = r;
          });
          setResultadosUsuario(mapa);
          setResultadosLista(resultResult.data);
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadHistorico = useCallback(async () => {
    if (!user?.id) return;
    setHistoricoLoading(true);
    try {
      const offset = (historicoPage - 1) * 10;
      const result = await buscarHistoricoCompleto(user.id, 10, offset);
      if (result.success && result.data) {
        setHistoricoData(result.data);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setHistoricoLoading(false);
    }
  }, [user?.id, historicoPage]);

  useEffect(() => {
    if (activeTab === 'historico' && user?.id) {
      loadHistorico();
    }
  }, [activeTab, user?.id, loadHistorico]);

  const calcularMetricas = useCallback(() => {
    const total = simulados.length;
    const idsAtivos = new Set(simulados.map(s => s.id));
    const titulosAtivos = new Set(simulados.map(s => s.titulo));
    
    const recordsValidos = studyRecords.filter(r => titulosAtivos.has(r.topic));
    const emAndamento = recordsValidos.filter(r => r.type === 'pratico' && !r.isDeleted).length;
    
    const resultadosValidos = Object.fromEntries(
      Object.entries(resultadosUsuario).filter(([id]) => idsAtivos.has(id))
    );
    const concluidos = Object.keys(resultadosValidos).length;

    let totalAcertos = 0;
    let totalQuestoes = 0;
    recordsValidos.forEach(r => {
      if (r.questionsCount && r.correctCount !== undefined) {
        totalQuestoes += r.questionsCount;
        totalAcertos += r.correctCount;
      }
    });
    Object.values(resultadosValidos).forEach((r: any) => {
      if (r.total_questoes) {
        totalQuestoes += r.total_questoes;
        totalAcertos += r.acertos;
      }
    });
    const mediaGeral = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;

    return { total, emAndamento, concluidos, mediaGeral };
  }, [simulados, studyRecords, resultadosUsuario]);

  const metricas = calcularMetricas();

  const handleStartSimulado = (id: string) => navigate(`/simulados/${id}`);
  const handleVerResultado = (id: string) => navigate(`/simulados/${id}?view=resultado`);

  const handleExcluirSimulado = async (id: string, titulo: string) => {
    if (!user?.id) return;
    const ok = await confirmDialog({
      title: `Excluir "${titulo}"?`,
      description: "O simulado e o histórico de tentativas serão removidos. Essa ação não pode ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    setExcluindo(id);
    try {
      const result = await excluirSimulado(id, user.id);
      if (result.success) {
        await loadData();
        toast.success("Simulado excluído com sucesso!");
      } else {
        toast.error("Erro ao excluir", { description: result.error });
      }
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err.message });
    } finally {
      setExcluindo(null);
    }
  };

  const handleImport = async () => {
    if (importPassword !== "admin123") { setImportError("Senha incorreta"); return; }
    if (!importFile) { setImportError("Selecione um arquivo JSON"); return; }
    if (!user?.id) { setImportError("Usuário não autenticado"); return; }

    setImporting(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await importFile.text();
      const json = JSON.parse(text);
      const result = await importarSimulado(json, user.id);
      if (result.success) {
        setImportSuccess(true);
        setImportFile(null);
        setImportPassword("");
        setIsImportModalOpen(false);
        loadData();
      } else {
        setImportError(result.error || "Erro ao importar");
      }
    } catch (err: any) {
      setImportError(err.message || "Erro ao processar arquivo");
    } finally {
      setImporting(false);
    }
  };

  const estatisticasGerais = useCallback(() => {
    const totalSimulados = resultadosLista.length;
    if (totalSimulados === 0) return null;

    const totalQuestoes = resultadosLista.reduce((acc, r) => acc + r.total_questoes, 0);
    const totalAcertos = resultadosLista.reduce((acc, r) => acc + r.acertos, 0);
    const totalErros = resultadosLista.reduce((acc, r) => acc + r.erros, 0);
    const mediaGeral = totalQuestoes > 0 ? Math.round((totalAcertos / totalQuestoes) * 100) : 0;
    const melhorResultado = Math.max(...resultadosLista.map(r => r.porcentagem));
    const piorResultado = Math.min(...resultadosLista.map(r => r.porcentagem));
    const totalTempo = resultadosLista.reduce((acc, r) => acc + r.tempo_segundos, 0);
    const tempoMedio = Math.round(totalTempo / totalSimulados / 60);

    return { totalSimulados, totalQuestoes, totalAcertos, totalErros, mediaGeral, melhorResultado, piorResultado, tempoMedio };
  }, [resultadosLista]);

  const desempenhoPorArea = useCallback((): any[] => {
    const areas: Record<string, { acertos: number; total: number }> = {};
    resultadosLista.forEach(resultado => {
      const respostas = resultado.respostas || {};
      const areasMap = resultado.areas || {};
      Object.keys(respostas).forEach(numero => {
        const num = parseInt(numero);
        const area = areasMap[num] || "Não categorizada";
        if (!areas[area]) areas[area] = { acertos: 0, total: 0 };
        areas[area].total++;
      });
    });
    return Object.keys(areas).map(area => ({
      area, acertos: areas[area].acertos, total: areas[area].total,
      porcentagem: areas[area].total > 0 ? Math.round((areas[area].acertos / areas[area].total) * 100) : 0,
    })).sort((a, b) => b.porcentagem - a.porcentagem);
  }, [resultadosLista]);

  const evolucao = useCallback(() => {
    return resultadosLista
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((r, index) => ({
        nome: `Sim ${index + 1}`,
        porcentagem: r.porcentagem,
        data: new Date(r.created_at).toLocaleDateString('pt-BR'),
        acertos: r.acertos,
        total: r.total_questoes,
      }));
  }, [resultadosLista]);

  const insights = useCallback(() => {
    const stats = estatisticasGerais();
    if (!stats) return [];
    const items: any[] = [];

    if (stats.mediaGeral >= 70) {
      items.push({ icon: <Award className="h-4 w-4 text-primary" />, message: `Ótimo desempenho! Sua média geral é de ${stats.mediaGeral}% 🎉`, type: "positive" });
    } else if (stats.mediaGeral >= 50) {
      items.push({ icon: <Target className="h-4 w-4 text-warning" />, message: `Bom desempenho! Sua média geral é de ${stats.mediaGeral}%. Continue praticando! 💪`, type: "neutral" });
    } else {
      items.push({ icon: <AlertCircle className="h-4 w-4 text-accent" />, message: `Sua média geral é de ${stats.mediaGeral}%. Que tal revisar os conteúdos? 📚`, type: "negative" });
    }

    if (resultadosLista.length >= 3) {
      const primeiro = resultadosLista[0].porcentagem;
      const ultimo = resultadosLista[resultadosLista.length - 1].porcentagem;
      const diferenca = ultimo - primeiro;
      if (diferenca > 5) items.push({ icon: <TrendingUp className="h-4 w-4 text-primary" />, message: `Você melhorou ${diferenca}% desde o primeiro simulado! Continue assim! 🚀`, type: "positive" });
      else if (diferenca < -5) items.push({ icon: <AlertCircle className="h-4 w-4 text-accent" />, message: `Seu desempenho caiu ${Math.abs(diferenca)}% desde o primeiro simulado. Vale revisar a estratégia.`, type: "negative" });
    }

    items.push({ icon: <CheckCircle2 className="h-4 w-4 text-primary" />, message: `Você já concluiu ${stats.totalSimulados} simulados! Continue assim! 💪`, type: "positive" });
    return items;
  }, [resultadosLista, estatisticasGerais]);

  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);

  const toggleComparisonSelection = (id: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.length >= 5) { toast.warning('Você pode comparar no máximo 5 simulados.'); return prev; }
      return [...prev, id];
    });
  };

  const getSelectedResults = () => resultadosLista
    .filter(r => selectedForComparison.includes(r.simulado_id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const getSimuladoTitulo = (simuladoId: string) => {
    const s = simulados.find(s => s.id === simuladoId);
    return s?.titulo || 'Simulado';
  };

  const selectedResults = getSelectedResults();

  const comparisonInsights = useCallback(() => {
    if (selectedResults.length < 2) return null;
    const melhor = selectedResults.reduce((a, b) => a.porcentagem > b.porcentagem ? a : b);
    const pior = selectedResults.reduce((a, b) => a.porcentagem < b.porcentagem ? a : b);
    const primeiro = selectedResults[0];
    const ultimo = selectedResults[selectedResults.length - 1];
    const diferenca = ultimo.porcentagem - primeiro.porcentagem;
    const items = [];

    items.push({ icon: <Award className="h-4 w-4 text-primary" />, message: `🏆 Melhor simulado: "${getSimuladoTitulo(melhor.simulado_id)}" com ${melhor.porcentagem}% de acertos` });
    if (selectedResults.length > 2) items.push({ icon: <Target className="h-4 w-4 text-warning" />, message: `📉 Pior simulado: "${getSimuladoTitulo(pior.simulado_id)}" com ${pior.porcentagem}% de acertos` });
    if (selectedResults.length >= 2) {
      const evolucao = diferenca > 0 ? `melhorou ${Math.abs(diferenca)}%` : `piorou ${Math.abs(diferenca)}%`;
      items.push({ icon: diferenca > 0 ? <TrendingUp className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-accent" />, message: `📊 Do primeiro para o último simulado, você ${evolucao}` });
    }
    const media = Math.round(selectedResults.reduce((acc, r) => acc + r.porcentagem, 0) / selectedResults.length);
    items.push({ icon: <BarChart3 className="h-4 w-4 text-primary" />, message: `📊 Média dos ${selectedResults.length} simulados selecionados: ${media}%` });
    return items;
  }, [selectedResults]);

  const comparacaoPorArea = useCallback(() => {
    if (selectedResults.length < 2) return null;
    const areasMap: Record<string, Record<string, { acertos: number; total: number }>> = {};
    selectedResults.forEach((resultado) => {
      const simuladoTitulo = getSimuladoTitulo(resultado.simulado_id);
      const respostas = resultado.respostas || {};
      const areas = resultado.areas || {};
      areasMap[simuladoTitulo] = {};
      Object.keys(respostas).forEach(numero => {
        const num = parseInt(numero);
        const area = areas[num] || "Não categorizada";
        if (!areasMap[simuladoTitulo][area]) areasMap[simuladoTitulo][area] = { acertos: 0, total: 0 };
        areasMap[simuladoTitulo][area].total++;
      });
    });

    const result: { area: string; simulados: Record<string, number> }[] = [];
    const todasAreas = new Set<string>();
    Object.values(areasMap).forEach(sim => Object.keys(sim).forEach(area => todasAreas.add(area)));

    todasAreas.forEach(area => {
      const simuladosMap: Record<string, number> = {};
      Object.keys(areasMap).forEach(simNome => {
        const data = areasMap[simNome][area];
        simuladosMap[simNome] = data ? Math.round((data.acertos / data.total) * 100) : 0;
      });
      result.push({ area, simulados: simuladosMap });
    });
    return result.sort((a, b) => a.area.localeCompare(b.area));
  }, [selectedResults]);

  const comparacaoAreaData = comparacaoPorArea();
  const comparisonData = comparisonInsights();
  const stats = estatisticasGerais();
  const areas = desempenhoPorArea();
  const evolucaoData = evolucao();
  const insightsData = insights();

  return (
    <AppShell breadcrumb="Simulados" title="Simulados">
      <div className="mb-6 flex gap-1 border-b border-border">
        <button
          onClick={() => setMainTab('simulados')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            mainTab === 'simulados'
              ? 'border-primary text-primary'
              : 'border-transparent text-foreground/50 hover:text-foreground'
          }`}
        >
          Simulados
        </button>
        <button
          onClick={() => setMainTab('listas')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            mainTab === 'listas'
              ? 'border-primary text-primary'
              : 'border-transparent text-foreground/50 hover:text-foreground'
          }`}
        >
          Listas
        </button>
      </div>

      {mainTab === 'simulados' ? (
        loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rf-card p-6 text-center">
            <p className="text-accent">{error}</p>
            <button onClick={loadData} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
              {resultadosLista.length > 0 && (
                <button
                  onClick={() => setIsStatsModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
                >
                  <TrendingUp className="h-4 w-4" /> Estatísticas
                </button>
              )}
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Upload className="h-4 w-4" /> Novo simulado
              </button>
            </div>

            {simulados.length > 0 ? (
              <div className="rf-card p-2 sm:p-3">
                <ul className="divide-y divide-border">
                  {simulados.map((s) => {
                    const resultado = resultadosUsuario[s.id] || null;
                    const temResultado = !!resultado;
                    const pct = temResultado ? resultado.porcentagem || 0 : 0;
                    return (
                      <li key={s.id}>
                        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
                          <div
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                            style={{ backgroundColor: 'color-mix(in oklab, var(--accent) 25%, transparent)', color: 'var(--accent)' }}
                          >
                            <FileStack className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <button onClick={() => handleStartSimulado(s.id)} className="block w-full text-left">
                              <h3 className="font-display text-base font-bold tracking-tight truncate">
                                {s.titulo}
                              </h3>
                              <p className="text-xs text-foreground/45 mt-0.5">
                                {s.questoes_count || 0} questões
                                {s.tempo_total ? ` · ${s.tempo_total}min` : ''}
                                {s.area ? ` · ${s.area}` : ''}
                                {s.ano ? ` · ${s.ano}` : ''}
                              </p>
                            </button>
                          </div>

                          <div className="flex items-center gap-4 sm:w-auto w-full">
                            {temResultado && (
                              <div className="flex-1 sm:w-48 sm:flex-initial">
                                <div className="flex items-baseline justify-between gap-2 mb-1">
                                  <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/45">Acertos</span>
                                  <span className="text-sm font-bold tabular-nums">{pct}%</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-1.5">
                              {temResultado ? (
                                <>
                                  <button
                                    onClick={() => handleVerResultado(s.id)}
                                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
                                  >
                                    Ver detalhes
                                  </button>
                                  <button
                                    onClick={() => handleStartSimulado(s.id)}
                                    className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-foreground/60 hover:bg-surface-2 transition-colors"
                                    title="Refazer"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleStartSimulado(s.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                                >
                                  <Play className="h-3.5 w-3.5" /> Iniciar
                                </button>
                              )}
                              <button
                                onClick={() => handleExcluirSimulado(s.id, s.titulo)}
                                disabled={excluindo === s.id}
                                className="grid h-8 w-8 place-items-center rounded-full text-foreground/30 hover:text-destructive transition-colors disabled:opacity-50"
                                title="Excluir simulado"
                              >
                                {excluindo === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
                <div className="text-center">
                  <p className="text-sm text-foreground/40">Nenhum simulado cadastrado ainda.</p>
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    <Upload className="h-3.5 w-3.5" /> Importar simulado
                  </button>
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <ListasTab />
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Importar simulado (JSON)</h3>
              <button
                onClick={() => { setIsImportModalOpen(false); setImportError(null); setImportSuccess(false); }}
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {importSuccess ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">Simulado importado com sucesso!</p>
                <button
                  onClick={() => { setIsImportModalOpen(false); setImportSuccess(false); }}
                  className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground/70">Senha administrativa *</label>
                  <input
                    type="password"
                    placeholder="Digite a senha"
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground/70">Arquivo JSON *</label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => { const file = e.target.files?.[0] || null; setImportFile(file); setImportError(null); }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
                  />
                  <p className="mt-1 text-xs text-foreground/40">O JSON deve seguir o schema definido em `simulados-types.ts`.</p>
                </div>

                {importError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                    {importError}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setIsImportModalOpen(false); setImportError(null); }}
                    className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                    disabled={importing}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Importar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isStatsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl font-bold">📊 Estatísticas de Simulados</h2>
                <p className="text-sm text-foreground/50">Análise completa do seu desempenho</p>
              </div>
              <button
                onClick={() => setIsStatsModalOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-1 mb-6 border-b border-border">
              <button
                onClick={() => setActiveTab('estatisticas')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'estatisticas' ? 'border-primary text-primary' : 'border-transparent text-foreground/50 hover:text-foreground'
                }`}
              >
                📊 Estatísticas
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'historico' ? 'border-primary text-primary' : 'border-transparent text-foreground/50 hover:text-foreground'
                }`}
              >
                📋 Histórico ({resultadosLista.length})
              </button>
            </div>

            {activeTab === 'estatisticas' && stats && (
              <>
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiStats label="Simulados" value={stats.totalSimulados} icon={<Target className="h-3.5 w-3.5" />} />
                  <KpiStats label="Média geral" value={`${stats.mediaGeral}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} accent />
                  <KpiStats label="Melhor resultado" value={`${stats.melhorResultado}%`} icon={<Award className="h-3.5 w-3.5" />} />
                  <KpiStats label="Tempo médio" value={`${stats.tempoMedio}min`} icon={<Clock className="h-3.5 w-3.5" />} />
                </div>

                {resultadosLista.length >= 2 && (
                  <section className="mb-4 rf-card p-4">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setComparisonExpanded(!comparisonExpanded)} className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        <h3 className="font-display text-sm font-semibold">Comparar simulados</h3>
                        <span className="text-xs text-foreground/40">
                          {selectedForComparison.length > 0 ? `(${selectedForComparison.length} selecionados)` : '(selecione 2-5 simulados)'}
                        </span>
                      </button>
                      <button onClick={() => setComparisonExpanded(!comparisonExpanded)} className="text-foreground/40 hover:text-foreground transition-colors">
                        {comparisonExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {comparisonExpanded && (
                      <div className="mt-4">
                        <div className="mb-4 flex flex-wrap gap-2">
                          {resultadosLista
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((r) => {
                              const isSelected = selectedForComparison.includes(r.simulado_id);
                              const titulo = getSimuladoTitulo(r.simulado_id);
                              return (
                                <button
                                  key={r.simulado_id}
                                  onClick={() => toggleComparisonSelection(r.simulado_id)}
                                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-primary/15 text-primary border border-primary/30'
                                      : 'bg-surface border border-border text-foreground/60 hover:bg-surface-2'
                                  }`}
                                >
                                  <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-foreground/20'}`} />
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
                                      <th key={r.simulado_id} className="text-center py-2 px-3 text-foreground/40 font-medium">
                                        {getSimuladoTitulo(r.simulado_id)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="border-b border-border/50">
                                    <td className="py-2 px-3 text-foreground/60">Data</td>
                                    {selectedResults.map((r) => (
                                      <td key={r.simulado_id} className="text-center py-2 px-3 text-foreground/40">
                                        {new Date(r.created_at).toLocaleDateString('pt-BR')}
                                      </td>
                                    ))}
                                  </tr>
                                  <tr className="border-b border-border/50">
                                    <td className="py-2 px-3 text-foreground/60">Acertos</td>
                                    {selectedResults.map((r) => (
                                      <td key={r.simulado_id} className="text-center py-2 px-3 font-medium">
                                        {r.acertos}/{r.total_questoes}
                                      </td>
                                    ))}
                                  </tr>
                                  <tr className="border-b border-border/50">
                                    <td className="py-2 px-3 text-foreground/60">Porcentagem</td>
                                    {selectedResults.map((r) => (
                                      <td key={r.simulado_id} className="text-center py-2 px-3 font-semibold">
                                        <span className={r.porcentagem >= 70 ? 'text-primary' : r.porcentagem >= 50 ? 'text-warning' : 'text-accent'}>
                                          {r.porcentagem}%
                                        </span>
                                      </td>
                                    ))}
                                  </tr>
                                  <tr className="border-b border-border/50">
                                    <td className="py-2 px-3 text-foreground/60">Tempo</td>
                                    {selectedResults.map((r) => (
                                      <td key={r.simulado_id} className="text-center py-2 px-3 text-foreground/40">
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
                                        <td key={r.simulado_id} className="text-center py-2 px-3">
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

                            {comparisonData && (
                              <div className="mt-4 space-y-1.5">
                                {comparisonData.map((item, index) => (
                                  <div key={index} className="flex items-start gap-2 rounded-lg bg-white/5 p-2 text-xs">
                                    {item.icon}
                                    <span className="text-foreground/80">{item.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {comparacaoAreaData && comparacaoAreaData.length > 0 && (
                              <div className="mt-4">
                                <h4 className="mb-2 text-xs font-semibold text-foreground/70">📊 Comparação por área</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="text-left py-1.5 px-2 text-foreground/40 font-medium">Área</th>
                                        {selectedResults.map((r) => (
                                          <th key={r.simulado_id} className="text-center py-1.5 px-2 text-foreground/40 font-medium">
                                            {getSimuladoTitulo(r.simulado_id)}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {comparacaoAreaData.map((item) => (
                                        <tr key={item.area} className="border-b border-border/40">
                                          <td className="py-1.5 px-2 text-foreground/70">{item.area}</td>
                                          {selectedResults.map((r) => {
                                            const simNome = getSimuladoTitulo(r.simulado_id);
                                            const pct = item.simulados[simNome] || 0;
                                            return (
                                              <td key={r.simulado_id} className="text-center py-1.5 px-2">
                                                <span className={pct >= 70 ? 'text-primary' : pct >= 50 ? 'text-warning' : 'text-accent'}>
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

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rf-card p-4">
                    <h3 className="mb-3 font-display text-sm font-semibold">📈 Evolução dos resultados</h3>
                    {evolucaoData.length > 0 ? (
                      <div className="space-y-2">
                        {evolucaoData.map((item, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <span className="text-xs font-medium text-foreground/50 w-12">{item.nome}</span>
                            <div className="flex-1 h-6 relative">
                              <div className="h-full rounded-full bg-primary/20 relative overflow-hidden" style={{ width: `${item.porcentagem}%` }}>
                                <div className={`h-full rounded-md ${item.porcentagem >= 70 ? 'bg-primary' : item.porcentagem >= 50 ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${item.porcentagem}%` }} />
                              </div>
                              <span className="absolute right-0 top-0 text-xs font-medium tabular-nums">{item.porcentagem}%</span>
                            </div>
                            <span className="text-[10px] text-foreground/40 whitespace-nowrap">{item.data}</span>
                          </div>
                        ))}
                      </div>
                    ) : (<p className="text-sm text-foreground/40 text-center">Sem dados suficientes</p>)}
                  </section>

                  <section className="rf-card p-4">
                    <h3 className="mb-3 font-display text-sm font-semibold">📊 Desempenho por área</h3>
                    {areas.length > 0 ? (
                      <div className="space-y-2">
                        {areas.slice(0, 5).map((area, index) => (
                          <div key={index}>
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{area.area}</span>
                              <span className="text-foreground/50">{area.porcentagem}%</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                              <div className={`h-full rounded-full ${area.porcentagem >= 70 ? 'bg-primary' : area.porcentagem >= 50 ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${area.porcentagem}%` }} />
                            </div>
                          </div>
                        ))}
                        {areas.length > 5 && (<p className="text-center text-[10px] text-foreground/40 pt-2">+{areas.length - 5} outras áreas</p>)}
                      </div>
                    ) : (<p className="text-sm text-foreground/40 text-center">Finalize simulados para ver este gráfico</p>)}
                  </section>
                </div>

                <section className="mt-4 rf-card p-4">
                  <h3 className="mb-3 font-display text-sm font-semibold">💡 Insights</h3>
                  <div className="space-y-2">
                    {insightsData.map((insight, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          insight.type === 'positive' ? 'border-primary/20 bg-primary/5' :
                          insight.type === 'negative' ? 'border-accent/20 bg-accent/5' :
                          'border-warning/20 bg-warning/5'
                        }`}
                      >
                        {insight.icon}
                        <p className="text-sm">{insight.message}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'historico' && (
              <div>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                    <input
                      type="text"
                      placeholder="Buscar por título ou área..."
                      value={historicoFilter}
                      onChange={(e) => setHistoricoFilter(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                    />
                  </div>
                </div>

                {historicoLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : historicoData.total === 0 ? (
                  <div className="text-center py-8">
                    <History className="mx-auto h-12 w-12 text-foreground/20" />
                    <p className="mt-4 text-foreground/50">Nenhum simulado concluído ainda.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {historicoData.resultados
                        .filter((r: any) => 
                          r.simulado_titulo?.toLowerCase().includes(historicoFilter.toLowerCase()) ||
                          r.simulado_area?.toLowerCase().includes(historicoFilter.toLowerCase())
                        )
                        .map((r: any) => (
                          <HistoricoCardMini
                            key={r.id}
                            resultado={r}
                            onVerResultado={() => { setIsStatsModalOpen(false); navigate(`/simulados/${r.simulado_id}?view=resultado`); }}
                          />
                        ))}
                    </div>

                    {historicoData.total > 10 && (
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs text-foreground/40">
                          Mostrando {((historicoPage - 1) * 10) + 1} - {Math.min(historicoPage * 10, historicoData.total)} de {historicoData.total}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setHistoricoPage(p => Math.max(1, p - 1))}
                            disabled={historicoPage === 1}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface text-foreground/60 hover:bg-surface-2 disabled:opacity-40"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setHistoricoPage(p => p + 1)}
                            disabled={historicoPage * 10 >= historicoData.total}
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
      )}
    </AppShell>
  );
}

function KpiStats({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rf-card p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-foreground/40">
        {icon} {label}
      </div>
      <div className={["mt-1 font-display text-xl font-bold tabular-nums", accent ? "text-accent" : "text-foreground"].join(" ")}>{value}</div>
    </div>
  );
}

function HistoricoCardMini({ resultado, onVerResultado }: { resultado: any; onVerResultado: () => void }) {
  const data = new Date(resultado.created_at);
  const pct = resultado.porcentagem || 0;
  const tempoMin = Math.floor(resultado.tempo_segundos / 60);

  return (
    <button onClick={onVerResultado} className="w-full rf-card hover:bg-surface/50 transition-colors p-3 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{resultado.simulado_titulo || 'Simulado'}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              pct >= 70 ? 'bg-primary/15 text-primary' :
              pct >= 50 ? 'bg-warning/15 text-warning' :
              'bg-accent/15 text-accent'
            }`}>
              {pct}%
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground/40">
            <span>{data.toLocaleDateString('pt-BR')}</span>
            <span>•</span>
            <span>{resultado.acertos}/{resultado.total_questoes} acertos</span>
            <span>•</span>
            <span>{tempoMin}min</span>
            {resultado.simulado_area && (<><span>•</span><span className="text-primary/60">{resultado.simulado_area}</span></>)}
          </div>
        </div>
        <Eye className="h-4 w-4 text-foreground/30 shrink-0" />
      </div>
    </button>
  );
}