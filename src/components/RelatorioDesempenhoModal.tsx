// src/components/RelatorioDesempenhoModal.tsx
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ChevronDown, ChevronRight, PlusCircle, Filter } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { getDb } from "@/lib/db";
import { getTaxonomia } from "@/services/taxonomiaService";
import type { QuestaoBanco } from "@/services/bancoQuestoesService";
import { criarCaderno } from "@/services/cadernoService";
import { useToast } from "@/hooks/useToast";

interface Props {
  userId: string;
  cadernoId?: string;
  titulo?: string;
  onClose: () => void;
}

interface AssuntoStats {
  nome: string;
  total: number;
  acertos: number;
  erros: number;
  porcentagem: number;
}

interface MateriaStats {
  nome: string;
  total: number;
  acertos: number;
  erros: number;
  porcentagem: number;
  assuntos: AssuntoStats[];
}

interface RawTentativa {
  questao_banco_id: string;
  acertou: boolean;
  created_at: string;
}

export function RelatorioDesempenhoModal({ userId, cadernoId, titulo, onClose }: Props) {
  const toast = useToast();
  
  const [loading, setLoading] = useState(true);
  const [criandoCaderno, setCriandoCaderno] = useState(false);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  
  // Dados brutos
  const [tentativas, setTentativas] = useState<RawTentativa[]>([]);
  const [questoesMap, setQuestoesMap] = useState<Map<string, QuestaoBanco>>(new Map());

  // Filtros
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "all">("all");
  const [filtroMateria, setFiltroMateria] = useState<string>("");

  useEffect(() => {
    async function carregarDados() {
      setLoading(true);
      try {
        const db = await getDb();
        const docsTentativas = await db.banco_tentativas.find({ selector: { user_id: userId } }).exec();
        
        let questoesValidas = new Set<string>();
        if (cadernoId) {
          const links = await db.caderno_questoes.find({ selector: { caderno_id: cadernoId } }).exec();
          links.forEach(l => questoesValidas.add(l.get('questao_banco_id')));
        }

        const docsQuestoes = await db.banco_questoes.find().exec();
        const mapQ = new Map<string, QuestaoBanco>();
        docsQuestoes.forEach(q => {
          if (!cadernoId || questoesValidas.has(q.get('id'))) {
            mapQ.set(q.get('id'), q.toJSON() as QuestaoBanco);
          }
        });

        const tArr: RawTentativa[] = [];
        docsTentativas.forEach(t => {
          const qId = t.get('questao_banco_id');
          if (cadernoId && !questoesValidas.has(qId)) return;
          if (!mapQ.has(qId)) return; // Ignora tentativas de questões que não estão no escopo

          tArr.push({
            questao_banco_id: qId,
            acertou: t.get('acertou'),
            created_at: t.get('created_at') || new Date().toISOString(),
          });
        });

        setTentativas(tArr);
        setQuestoesMap(mapQ);
      } catch (e) {
        console.error("Erro ao carregar estatísticas", e);
      } finally {
        setLoading(false);
      }
    }
    carregarDados();
  }, [userId, cadernoId]);

  // Processamento dos dados filtrados
  const { materias, dadosGrafico, dadosEvolucao, totalGeral, acertosGeral, errosGeral, porcentagemGeral, questoesErradasIds } = useMemo(() => {
    let tentativasFiltradas = tentativas;

    // Filtro de Período
    if (periodo !== "all") {
      const agora = new Date();
      const dias = periodo === "7d" ? 7 : 30;
      const limite = new Date();
      limite.setDate(agora.getDate() - dias);
      tentativasFiltradas = tentativasFiltradas.filter(t => new Date(t.created_at) >= limite);
    }

    const materiasMap = new Map<string, Map<string, { total: number, acertos: number }>>();
    
    // Inicializa taxonomia
    const taxonomia = getTaxonomia();
    taxonomia.forEach(t => {
      t.materias.forEach(m => {
        if (!materiasMap.has(m.nome)) materiasMap.set(m.nome, new Map());
        m.topicos.forEach(top => {
          materiasMap.get(m.nome)!.set(top.nome, { total: 0, acertos: 0 });
        });
      });
    });

    const mapaDias = new Map<string, { data: string, acertos: number, erros: number }>();
    const erradasIds = new Set<string>();

    tentativasFiltradas.forEach(t => {
      const q = questoesMap.get(t.questao_banco_id);
      if (!q) return;

      // Filtro de Matéria
      if (filtroMateria && (q.assunto || "Geral") !== filtroMateria) return;

      if (!t.acertou) erradasIds.add(q.id);

      const materia = q.assunto || "Geral";
      const assunto = q.subassunto || "Geral";

      if (!materiasMap.has(materia)) materiasMap.set(materia, new Map());
      const assuntosMap = materiasMap.get(materia)!;
      if (!assuntosMap.has(assunto)) assuntosMap.set(assunto, { total: 0, acertos: 0 });
      
      const stats = assuntosMap.get(assunto)!;
      stats.total += 1;
      if (t.acertou) stats.acertos += 1;

      // Agrupamento para gráfico de evolução (por dia)
      const dia = t.created_at.split('T')[0];
      if (!mapaDias.has(dia)) mapaDias.set(dia, { data: dia.split('-').reverse().slice(0,2).join('/'), acertos: 0, erros: 0 });
      const dStats = mapaDias.get(dia)!;
      if (t.acertou) dStats.acertos++; else dStats.erros++;
    });

    // Monta array de matérias
    const resultadoMaterias: MateriaStats[] = [];
    materiasMap.forEach((assuntosMap, materiaNome) => {
      let materiaTotal = 0;
      let materiaAcertos = 0;
      const assuntosArray: AssuntoStats[] = [];

      assuntosMap.forEach((stats, assuntoNome) => {
        materiaTotal += stats.total;
        materiaAcertos += stats.acertos;
        if (stats.total > 0) {
          assuntosArray.push({
            nome: assuntoNome, total: stats.total, acertos: stats.acertos,
            erros: stats.total - stats.acertos, porcentagem: Math.round((stats.acertos / stats.total) * 100)
          });
        }
      });

      if (materiaTotal > 0) {
        resultadoMaterias.push({
          nome: materiaNome, total: materiaTotal, acertos: materiaAcertos,
          erros: materiaTotal - materiaAcertos, porcentagem: Math.round((materiaAcertos / materiaTotal) * 100),
          assuntos: assuntosArray.sort((a, b) => a.porcentagem - b.porcentagem)
        });
      }
    });

    const matOrdenadas = resultadoMaterias.sort((a, b) => b.total - a.total);
    const tGeral = matOrdenadas.reduce((acc, m) => acc + m.total, 0);
    const aGeral = matOrdenadas.reduce((acc, m) => acc + m.acertos, 0);
    const eGeral = tGeral - aGeral;
    const pGeral = tGeral > 0 ? Math.round((aGeral / tGeral) * 100) : 0;

    const evolucaoArray = Array.from(mapaDias.values()).sort((a, b) => {
      // Ordena pela data real (YYYY-MM-DD) que foi perdida no formatador acima, então refazemos
      return 0; 
    });
    // Correção para ordenar as datas corretamente:
    const chavesOrdenadas = Array.from(mapaDias.keys()).sort();
    const evolucaoFinal = chavesOrdenadas.map(k => mapaDias.get(k)!);

    return {
      materias: matOrdenadas,
      dadosGrafico: [
        { name: "Acertos", value: aGeral, color: "#22c55e" },
        { name: "Erros", value: eGeral, color: "#ef4444" }
      ],
      dadosEvolucao: evolucaoFinal,
      totalGeral: tGeral,
      acertosGeral: aGeral,
      errosGeral: eGeral,
      porcentagemGeral: pGeral,
      questoesErradasIds: Array.from(erradasIds)
    };
  }, [tentativas, questoesMap, periodo, filtroMateria]);

  const materiasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    questoesMap.forEach(q => { if (q.assunto) set.add(q.assunto); });
    return Array.from(set).sort();
  }, [questoesMap]);

  const toggleExpandir = (materia: string) => {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(materia)) next.delete(materia); else next.add(materia);
      return next;
    });
  };

  const handleCriarCadernoErros = async () => {
    if (questoesErradasIds.length === 0) {
      toast.error("Nenhuma questão errada para criar o caderno.");
      return;
    }
    setCriandoCaderno(true);
    try {
      const nome = `Caderno de Erros - ${filtroMateria || 'Geral'} (${new Date().toLocaleDateString()})`;
      const res = await criarCaderno(userId, nome, "sem-pasta", questoesErradasIds);
      if (res.success) {
        toast.success("Caderno criado! Vá em 'Meus Cadernos' para acessar.");
      } else {
        toast.error(res.error || "Erro ao criar caderno.");
      }
    } catch {
      toast.error("Erro ao criar caderno.");
    } finally {
      setCriandoCaderno(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-bold font-display">
              Estatísticas: {titulo || "Banco Geral"}
            </h3>
            <p className="text-xs text-foreground/50">Análise detalhada do seu desempenho</p>
          </div>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Barra de Filtros */}
        <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-border bg-surface-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-foreground/50" />
            <span className="text-sm font-medium text-foreground/70">Filtros:</span>
          </div>
          
          <select 
            value={periodo} 
            onChange={(e) => setPeriodo(e.target.value as any)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="all">Todo o período</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="7d">Últimos 7 dias</option>
          </select>

          <select 
            value={filtroMateria} 
            onChange={(e) => setFiltroMateria(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Todas as matérias</option>
            {materiasDisponiveis.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Corpo Scrollável */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : totalGeral === 0 ? (
            <div className="text-center py-10 text-foreground/50">
              <p>Nenhuma questão respondida com esses filtros.</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Linha 1: Desempenho Geral + Gráfico de Rosca */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rf-card p-4 flex flex-col items-center justify-center">
                  <h4 className="text-sm font-semibold mb-2">Desempenho Geral</h4>
                  <div className="h-[200px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dadosGrafico} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={2} dataKey="value" stroke="none">
                          {dadosGrafico.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "white" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-bold">{porcentagemGeral}%</span>
                      <span className="text-[10px] text-foreground/50 uppercase tracking-wider">Aproveitamento</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-rows-3 gap-3">
                  <div className="rf-card p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground/70">Questões Resolvidas</span>
                    <span className="text-xl font-bold">{totalGeral}</span>
                  </div>
                  <div className="rf-card p-4 flex items-center justify-between border-l-4 border-l-green-500">
                    <span className="text-sm font-medium text-green-500">Acertos</span>
                    <span className="text-xl font-bold text-green-500">{acertosGeral}</span>
                  </div>
                  <div className="rf-card p-4 flex items-center justify-between border-l-4 border-l-red-500">
                    <span className="text-sm font-medium text-red-500">Erros</span>
                    <span className="text-xl font-bold text-red-500">{errosGeral}</span>
                  </div>
                </div>
              </div>

              {/* Linha 2: Gráfico de Evolução */}
              <div className="rf-card p-4">
                <h4 className="text-sm font-semibold mb-4">Evolução do Desempenho</h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dadosEvolucao} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAcertos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorErros" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="data" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                      <Tooltip contentStyle={{ backgroundColor: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="acertos" name="Acertos" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorAcertos)" />
                      <Area type="monotone" dataKey="erros" name="Erros" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorErros)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Linha 3: Tabela por Matéria */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Atividades por Matéria</h4>
                  <button 
                    onClick={handleCriarCadernoErros}
                    disabled={criandoCaderno || questoesErradasIds.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {criandoCaderno ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                    Criar Caderno com Erros
                  </button>
                </div>

                <div className="space-y-3">
                  {materias.map(materia => {
                    const isExpandida = expandidas.has(materia.nome);
                    return (
                      <div key={materia.nome} className="rf-card overflow-hidden">
                        <div className="grid sm:grid-cols-[1fr_100px_200px_80px] gap-4 items-center p-4 cursor-pointer hover:bg-surface-2 transition-colors" onClick={() => toggleExpandir(materia.nome)}>
                          <div className="flex items-center gap-2 font-semibold text-sm">
                            {isExpandida ? <ChevronDown className="h-4 w-4 text-foreground/50" /> : <ChevronRight className="h-4 w-4 text-foreground/50" />}
                            {materia.nome}
                          </div>
                          <div className="text-right text-xs font-medium text-foreground/60">{materia.total} questões</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden flex">
                              <div className="bg-green-500 h-full" style={{ width: `${materia.porcentagem}%` }} />
                              <div className="bg-red-500 h-full" style={{ width: `${100 - materia.porcentagem}%` }} />
                            </div>
                          </div>
                          <div className="text-right text-xs font-bold">
                            <span className="text-green-500">{materia.acertos}</span>
                            <span className="text-foreground/40 mx-1">/</span>
                            <span className="text-red-500">{materia.erros}</span>
                            <span className="ml-2 text-foreground">({materia.porcentagem}%)</span>
                          </div>
                        </div>
                        {isExpandida && materia.assuntos.length > 0 && (
                          <div className="border-t border-border/50 bg-background/30">
                            {materia.assuntos.map(assunto => (
                              <div key={assunto.nome} className="grid sm:grid-cols-[1fr_100px_200px_80px] gap-4 items-center p-3 pl-10 border-b border-border/30 last:border-0 text-xs">
                                <div className="text-foreground/80">{assunto.nome}</div>
                                <div className="text-right text-foreground/50">{assunto.total}</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden flex">
                                    <div className="bg-green-500 h-full" style={{ width: `${assunto.porcentagem}%` }} />
                                    <div className="bg-red-500 h-full" style={{ width: `${100 - assunto.porcentagem}%` }} />
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className={assunto.porcentagem >= 70 ? "text-green-500" : assunto.porcentagem >= 50 ? "text-warning" : "text-red-500"}>
                                    {assunto.porcentagem}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}