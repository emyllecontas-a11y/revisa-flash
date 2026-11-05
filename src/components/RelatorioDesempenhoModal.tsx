// src/components/RelatorioDesempenhoModal.tsx
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getDb } from "@/lib/db";
import { getTaxonomia } from "@/services/taxonomiaService";
import type { QuestaoBanco } from "@/services/bancoQuestoesService";

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

export function RelatorioDesempenhoModal({ userId, cadernoId, titulo, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [materias, setMaterias] = useState<MateriaStats[]>([]);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function calcularEstatisticas() {
      setLoading(true);
      try {
        const db = await getDb();
        
        const tentativas = await db.banco_tentativas.find({ selector: { user_id: userId } }).exec();
        
        let questoesValidas = new Set<string>();
        if (cadernoId) {
          const links = await db.caderno_questoes.find({ selector: { caderno_id: cadernoId } }).exec();
          links.forEach(l => questoesValidas.add(l.get('questao_banco_id')));
        }

        const questoes = await db.banco_questoes.find().exec();
        const questoesMap = new Map<string, QuestaoBanco>();
        questoes.forEach(q => {
          if (!cadernoId || questoesValidas.has(q.get('id'))) {
            questoesMap.set(q.get('id'), q.toJSON() as QuestaoBanco);
          }
        });

        const materiasMap = new Map<string, Map<string, { total: number, acertos: number }>>();

        const taxonomia = getTaxonomia();
        taxonomia.forEach(t => {
          t.materias.forEach(m => {
            if (!materiasMap.has(m.nome)) materiasMap.set(m.nome, new Map());
            m.topicos.forEach(top => {
              materiasMap.get(m.nome)!.set(top.nome, { total: 0, acertos: 0 });
            });
          });
        });

        tentativas.forEach(t => {
          const qId = t.get('questao_banco_id');
          const acertou = t.get('acertou');
          
          if (cadernoId && !questoesValidas.has(qId)) return;
          
          const q = questoesMap.get(qId);

          if (q) {
            const materia = q.assunto || "Geral";
            const assunto = q.subassunto || "Geral";

            if (!materiasMap.has(materia)) materiasMap.set(materia, new Map());
            const assuntosMap = materiasMap.get(materia)!;
            if (!assuntosMap.has(assunto)) assuntosMap.set(assunto, { total: 0, acertos: 0 });
            
            const stats = assuntosMap.get(assunto)!;
            stats.total += 1;
            if (acertou) stats.acertos += 1;
          }
        });

        const resultado: MateriaStats[] = [];
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
            resultado.push({
              nome: materiaNome, total: materiaTotal, acertos: materiaAcertos,
              erros: materiaTotal - materiaAcertos, porcentagem: Math.round((materiaAcertos / materiaTotal) * 100),
              assuntos: assuntosArray.sort((a, b) => a.porcentagem - b.porcentagem)
            });
          }
        });

        setMaterias(resultado.sort((a, b) => b.total - a.total));
      } catch (e) {
        console.error("Erro ao carregar estatísticas", e);
      } finally {
        setLoading(false);
      }
    }
    calcularEstatisticas();
  }, [userId, cadernoId]);

  const toggleExpandir = (materia: string) => {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(materia)) next.delete(materia); else next.add(materia);
      return next;
    });
  };

  const totalGeral = materias.reduce((acc, m) => acc + m.total, 0);
  const acertosGeral = materias.reduce((acc, m) => acc + m.acertos, 0);
  const errosGeral = totalGeral - acertosGeral;
  const porcentagemGeral = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;

  const dadosGrafico = [
    { name: "Acertos", value: acertosGeral, color: "#22c55e" },
    { name: "Erros", value: errosGeral, color: "#ef4444" }
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-elevated">
        
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-bold font-display">
              Desempenho: {titulo || "Banco Geral"}
            </h3>
            <p className="text-xs text-foreground/50">Análise detalhada das suas respostas</p>
          </div>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : materias.length === 0 ? (
            <div className="text-center py-10 text-foreground/50">
              <p>Você ainda não respondeu questões {titulo ? "deste caderno" : "suficientes"} para gerar estatísticas.</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rf-card p-4 flex flex-col items-center justify-center">
                  <h4 className="text-sm font-semibold mb-2">Aproveitamento</h4>
                  <div className="h-[180px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dadosGrafico} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                          {dadosGrafico.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "white" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold">{porcentagemGeral}%</span>
                      <span className="text-[10px] text-foreground/50 uppercase tracking-wider">Acertos</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-rows-3 gap-3">
                  <div className="rf-card p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground/70">Total Respondido</span>
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

              <hr className="border-border" />

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
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}