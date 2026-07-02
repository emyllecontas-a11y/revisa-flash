import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useStudy } from "@/contexts/StudyContext";
import { useErrors } from "@/contexts/ErrorContext";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { getDb } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";

// ============================================================
// TIPOS
// ============================================================
type HeatmapData = number[][]; // 12 semanas x 7 dias

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function DesempenhoPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Contextos
  const studyContext = useStudy();
  const { records: studyRecords } = studyContext;
  const errorContext = useErrors();
  const { records: errorRecords, getTotalErrors } = errorContext;
  const flashcardContext = useFlashcardContext();
  const { dueCards, decks } = flashcardContext;

  // Dados calculados
  const [metricas, setMetricas] = useState({
    acertosGerais: 0,
    cardsRevisados: 0,
    horasEstudo: 0,
    questoesResolvidas: 0,
  });
  const [heatmap, setHeatmap] = useState<HeatmapData>([]);
  const [topAreas, setTopAreas] = useState<{ nome: string; icon: string; erros: number; total: number }[]>([]);
  const [evolucaoAcertos, setEvolucaoAcertos] = useState<number[]>([]);

  // ============================================================
  // CARREGAR USUÁRIO
  // ============================================================
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
        else {
          const cachedId = localStorage.getItem('revisaflash_user_id');
          if (cachedId) setUserId(cachedId);
        }
      } catch (e) {
        console.warn('Erro ao carregar usuário:', e);
      }
    };
    loadUser();
  }, []);

  // ============================================================
  // CALCULAR MÉTRICAS
  // ============================================================
  useEffect(() => {
    if (!userId) return;

    // 1. Métricas gerais
    const totalQuestoes = studyRecords.reduce((acc, r) => acc + (r.questionsCount || 0), 0);
    const totalCorretas = studyRecords.reduce((acc, r) => acc + (r.correctCount || 0), 0);
    const totalHoras = studyRecords.reduce((acc, r) => acc + (r.duration || 0), 0) / 60;
    const cardsRevisados = dueCards.length; // flashcards devidos hoje (ou total?)

    setMetricas({
      acertosGerais: totalQuestoes > 0 ? Math.round((totalCorretas / totalQuestoes) * 100) : 0,
      cardsRevisados: cardsRevisados,
      horasEstudo: Math.round(totalHoras * 10) / 10,
      questoesResolvidas: totalQuestoes,
    });

    // 2. Heatmap (12 semanas)
    const heatmapData = gerarHeatmap(studyRecords);
    setHeatmap(heatmapData);

    // 3. Áreas com mais erros
    const areas = calcularAreasErro(errorRecords);
    setTopAreas(areas);

    // 4. Evolução de acertos (últimas 12 semanas)
    const evolucao = calcularEvolucaoAcertos(studyRecords);
    setEvolucaoAcertos(evolucao);

    setLoading(false);
  }, [userId, studyRecords, errorRecords, dueCards]);

  // ============================================================
  // FUNÇÕES AUXILIARES
  // ============================================================

  function gerarHeatmap(records: any[]): HeatmapData {
    // Últimas 12 semanas (84 dias)
    const hoje = new Date();
    const dataInicio = new Date(hoje);
    dataInicio.setDate(dataInicio.getDate() - 83); // 84 dias - 1

    // Mapear dias estudados
    const diasEstudados = new Map<string, number>();
    records.forEach(r => {
      const data = r.date;
      const horas = (r.duration || 0) / 60;
      diasEstudados.set(data, (diasEstudados.get(data) || 0) + horas);
    });

    // Construir matriz 12x7
    const semanas: number[][] = [];
    let semanaAtual: number[] = [];
    let diaAtual = new Date(dataInicio);

    for (let i = 0; i < 84; i++) {
      const dateStr = diaAtual.toISOString().split('T')[0];
      const horas = diasEstudados.get(dateStr) || 0;
      const nivel = horas > 0 ? Math.min(Math.floor(horas / 0.5) + 1, 4) : 0;
      semanaAtual.push(nivel);

      if (semanaAtual.length === 7) {
        semanas.push(semanaAtual);
        semanaAtual = [];
      }
      diaAtual.setDate(diaAtual.getDate() + 1);
    }

    // Garantir que temos 12 semanas
    while (semanas.length < 12) {
      semanas.push(Array(7).fill(0));
    }

    return semanas.slice(0, 12);
  }

  function calcularAreasErro(records: any[]): { nome: string; icon: string; erros: number; total: number }[] {
    const areaMap = new Map<string, { erros: number; total: number; icon: string }>();
    const icones = ['🔬', '🦷', '💉', '⚙️', '📐', '🪥', '💊', '📷'];

    records.forEach(r => {
      const area = r.area || 'Não categorizado';
      if (!areaMap.has(area)) {
        const index = areaMap.size % icones.length;
        areaMap.set(area, { erros: 0, total: 0, icon: icones[index] });
      }
      const data = areaMap.get(area)!;
      data.erros += 1;
      data.total += 1;
    });

    return Array.from(areaMap.entries())
      .map(([nome, data]) => ({ nome, icon: data.icon, erros: data.erros, total: data.total }))
      .sort((a, b) => b.erros - a.erros)
      .slice(0, 5);
  }

  function calcularEvolucaoAcertos(records: any[]): number[] {
    // Agrupar por semana (últimas 12 semanas)
    const hoje = new Date();
    const semanas: { total: number; corretas: number }[] = Array(12).fill(null).map(() => ({ total: 0, corretas: 0 }));

    records.forEach(r => {
      const data = new Date(r.date);
      const diffDias = Math.floor((hoje.getTime() - data.getTime()) / (1000 * 60 * 60 * 24));
      const semanaIndex = Math.max(0, 11 - Math.floor(diffDias / 7));
      if (semanaIndex >= 0 && semanaIndex < 12) {
        semanas[semanaIndex].total += r.questionsCount || 0;
        semanas[semanaIndex].corretas += r.correctCount || 0;
      }
    });

    return semanas.map(s => s.total > 0 ? Math.round((s.corretas / s.total) * 100) : 0);
  }

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <AppShell breadcrumb="Desempenho" title="Carregando...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppShell>
    );
  }

  // Dados para o heatmap (agrupar em meses)
  const meses = [
    { nome: "Sem 1", semanas: heatmap.slice(0, 4) },
    { nome: "Sem 2", semanas: heatmap.slice(4, 8) },
    { nome: "Sem 3", semanas: heatmap.slice(8, 12) },
  ];

  // Verifica se há dados
  const hasData = metricas.questoesResolvidas > 0 || heatmap.some(s => s.some(v => v > 0));

if (!hasData) {
  return (
    <AppShell breadcrumb="Desempenho" title="Sua evolução">
      <div id="desempenho-header">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-foreground/60 text-lg font-medium">Nenhum dado de desempenho ainda</p>
            <p className="text-foreground/40 text-sm mt-2">Comece a estudar e registre seu progresso para ver suas estatísticas aqui.</p>
          </div>
        </div>
      </div> 
    </AppShell>
  );
}

  return (
    <AppShell breadcrumb="Desempenho" title="Sua evolução">
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Acertos gerais" value={`${metricas.acertosGerais}%`} />
        <Big label="Cards revisados" value={metricas.cardsRevisados.toLocaleString("pt-BR")} />
        <Big label="Horas de estudo" value={`${metricas.horasEstudo}h`} />
        <Big label="Questões resolvidas" value={metricas.questoesResolvidas.toLocaleString("pt-BR")} />
      </div>

      {/* HEATMAP */}
      <section className="rf-card p-5 mb-6">
        <header className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Consistência — 12 semanas</h2>
            <p className="text-xs text-foreground/45">Cada quadrado representa um dia de estudo.</p>
          </div>
          <Legend />
        </header>

        <div className="grid grid-cols-3 gap-8">
          {meses.map((mes, mi) => (
            <div key={mi}>
              <div className="text-xs font-medium text-foreground/55 mb-1.5">{mes.nome}</div>
              <div className="flex gap-1 mb-1">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <div key={i} className="w-6 text-center text-[10px] text-foreground/40 uppercase tracking-wider">
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                {mes.semanas.map((week, wi) => (
                  <div key={wi} className="flex gap-1">
                    {week.map((v, di) => (
                      <div
                        key={di}
                        className={["h-6 w-6 rounded-[2px]", heatClass(v)].join(" ")}
                        title={`Semana ${wi + 1} · nível ${v}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Áreas que mais erram */}
        <section className="rf-card p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Áreas que mais erram</h2>
          {topAreas.length > 0 ? (
            <ul className="space-y-3">
              {topAreas.map((a) => {
                const pct = a.total > 0 ? Math.round((a.erros / a.total) * 100) : 0;
                return (
                  <li key={a.nome}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <span>{a.icon}</span>
                        {a.nome}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-foreground/65">
                        {a.erros} <span className="text-foreground/35">/ {a.total}</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={["h-full rounded-full", pct >= 30 ? "bg-accent" : "bg-primary/70"].join(" ")}
                        style={{ width: `${Math.min(pct * 4, 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-4">Nenhum erro registrado ainda.</p>
          )}
        </section>

        {/* Evolução de acertos */}
        <section className="rf-card p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Evolução de acertos</h2>
          {evolucaoAcertos.some(v => v > 0) ? (
            <>
              <Sparkline values={evolucaoAcertos} />
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="font-display text-xl font-semibold tabular-nums text-primary">
                    {evolucaoAcertos.length > 1 ? `+${evolucaoAcertos[evolucaoAcertos.length - 1] - evolucaoAcertos[0]}pp` : '0pp'}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-foreground/40">vs início</div>
                </div>
                <div>
                  <div className="font-display text-xl font-semibold tabular-nums">
                    {evolucaoAcertos[evolucaoAcertos.length - 1] || 0}%
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-foreground/40">média atual</div>
                </div>
                <div>
                  <div className="font-display text-xl font-semibold tabular-nums">
                    {Math.max(...evolucaoAcertos)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-foreground/40">pico</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-4">Sem dados suficientes para evolução.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

// ============================================================
// COMPONENTES VISUAIS
// ============================================================

function heatClass(v: number) {
  return ["bg-white/5", "bg-primary/20", "bg-primary/45", "bg-primary/70", "bg-primary"][v] || "bg-white/5";
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40">
      <span>Menos</span>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((v) => (
          <span key={v} className={["h-2.5 w-2.5 rounded-[2px]", heatClass(v)].join(" ")} />
        ))}
      </div>
      <span>Mais</span>
    </div>
  );
}

function Big({ label, value, delta, positive }: { label: string; value: string; delta?: string; positive?: boolean }) {
  return (
    <div className="rf-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
        {delta && (
          <span className={["text-[11px] font-medium", positive ? "text-primary" : "text-accent"].join(" ")}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  });
  const d = `M ${pts.join(" L ")}`;
  const area = `${d} L 100,100 L 0,100 Z`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g)" />
      <path d={d} fill="none" stroke="#14B8A6" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}