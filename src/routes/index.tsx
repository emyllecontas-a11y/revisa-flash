import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import {
  Check, Plus, Clock, ArrowUpRight, Flame, Target, BookOpen, AlertTriangle, X, RefreshCw, Loader2, Calendar, Layers, ChevronRight
} from "lucide-react";
import { useStudy } from "@/contexts/StudyContext";
import { useErrors } from "@/contexts/ErrorContext";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { useAppUser } from "@/contexts/UserContext";
import { getDb, syncWithSupabase, readLastSync } from "@/lib/db";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { OnboardingTour } from "@/components/OnboardingTour";

interface ChecklistItem {
  id: string;
  titulo: string;
  feito: boolean;
}

interface ProximaRevisao {
  id: string;
  area: string;
  topico: string;
  quando: string;
  cards: number;
  date: Date;
}

export default function DashboardPage() {
  const { user, isLoaded } = useAppUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Usuário");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isAddingChecklist, setIsAddingChecklist] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [streak, setStreak] = useState(0);
  const [disciplinasProgresso, setDisciplinasProgresso] = useState<{ nome: string; progresso: number }[]>([]);
  const [totalErros, setTotalErros] = useState(0);
  const [diasAteProva, setDiasAteProva] = useState(0);
  const [loading, setLoading] = useState(true);
  const [proximasRevisoes, setProximasRevisoes] = useState<ProximaRevisao[]>([]);
  const [revisoesAtrasadas, setRevisoesAtrasadas] = useState<ProximaRevisao[]>([]);

  const [provaNome, setProvaNome] = useState<string>("ENARE 2026");
  const [provaData, setProvaData] = useState<Date | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const studyContext = useStudy();
  const { records: studyRecords } = studyContext;
  const errorContext = useErrors();
  const { getTotalErrors } = errorContext;
  const flashcardContext = useFlashcardContext();
  const { dueCards, decks } = flashcardContext;

  const getSaudacao = () => {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
  };

  const getDataPorExtenso = () => {
    const hoje = new Date();
    const diaSemana = hoje.toLocaleDateString('pt-BR', { weekday: 'long' });
    const diaMes = hoje.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    return `${diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)}, ${diaMes}`;
  };

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true);

        const clerkUserId = user?.id || null;
        if (!clerkUserId) {
          setLoading(false);
          return;
        }

        setUserId(clerkUserId);
        localStorage.setItem('revisaflash_user_id', clerkUserId);

        let profileName = "Usuário";
        let provaNomeTemp = "ENARE 2026";
        let provaDataTemp: Date | null = null;

        try {
          const supabaseClient = await getSupabaseWithToken();
          const { data: profile } = await supabaseClient
            .from('profiles')
            .select('name, prova_nome, prova_data')
            .eq('id', clerkUserId)
            .maybeSingle();

          if (profile) {
            if (profile.name) {
              profileName = profile.name;
            } else {
              profileName = user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || "Usuário";
            }
            if (profile.prova_nome) provaNomeTemp = profile.prova_nome;
            if (profile.prova_data) {
              const date = new Date(profile.prova_data);
              if (!isNaN(date.getTime())) provaDataTemp = date;
            }
          } else {
            profileName = user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || "Usuário";
          }
        } catch (e) {
          console.warn('Erro ao carregar perfil (offline ou erro):', e);
          profileName = user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || "Usuário";
          const savedProvaNome = localStorage.getItem('offline_prova_nome');
          const savedProvaData = localStorage.getItem('offline_prova_data');
          if (savedProvaNome) provaNomeTemp = savedProvaNome;
          if (savedProvaData) {
            const date = new Date(savedProvaData);
            if (!isNaN(date.getTime())) provaDataTemp = date;
          }
        }

        setUserName(profileName);
        localStorage.setItem('revisaflash_user_name', profileName);
        setProvaNome(provaNomeTemp);
        setProvaData(provaDataTemp);

        let dataProva = provaDataTemp;
        if (!dataProva) dataProva = new Date(2026, 8, 13);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        dataProva.setHours(0, 0, 0, 0);
        const diff = Math.ceil((dataProva.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        setDiasAteProva(Math.max(0, diff));

        if (studyRecords.length > 0) {
          const datas = [...new Set(studyRecords.map(r => r.date))].sort();
          if (datas.length > 0) {
            const hojeStr = new Date().toISOString().split('T')[0];
            let streakCount = 0;
            let dataAtual = hojeStr;
            for (let i = datas.length - 1; i >= 0; i--) {
              if (datas[i] === dataAtual) {
                streakCount++;
                const dataAnterior = new Date(dataAtual);
                dataAnterior.setDate(dataAnterior.getDate() - 1);
                dataAtual = dataAnterior.toISOString().split('T')[0];
              } else break;
            }
            setStreak(streakCount);
          }
        }

        try {
          const db = await getDb();
          const disciplinesResult = await db.disciplines.find({
            selector: { user_id: clerkUserId, isDeleted: { $ne: true } }
          }).exec();
          const disciplinas = disciplinesResult.map((doc: any) => doc.toJSON());

          const topicsResult = await db.topics.find({
            selector: { user_id: clerkUserId, isDeleted: { $ne: true } }
          }).exec();
          const topicos = topicsResult.map((doc: any) => doc.toJSON());

          const progresso = disciplinas.map(d => {
            const topicosDaDisciplina = topicos.filter(t => t.discipline_id === d.id);
            const total = topicosDaDisciplina.length;
            if (total === 0) return { nome: d.name, progresso: 0 };
            const concluidos = topicosDaDisciplina.filter(t => t.status === 'dominado' || t.status === 'revisado').length;
            const pct = Math.round((concluidos / total) * 100);
            return { nome: d.name, progresso: pct };
          });
          progresso.sort((a, b) => b.progresso - a.progresso);
          setDisciplinasProgresso(progresso.slice(0, 4));
        } catch (error) {
          console.error('Erro ao carregar progresso:', error);
        }

        setTotalErros(getTotalErrors());

        try {
          const db = await getDb();
          const hojeStr = new Date().toISOString().split('T')[0];
          const revisoesResult = await db.revisoes.find({
            selector: { user_id: clerkUserId }
          }).exec();
          const revisoes = revisoesResult.map((doc: any) => doc.toJSON());

          const atrasadas: ProximaRevisao[] = [];
          const futuras: ProximaRevisao[] = [];

          revisoes.forEach(r => {
            if (!r.nextReviewDate || r.completedAt) return;
            const date = new Date(r.nextReviewDate);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            const diffDias = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            let quando: string;
            if (diffDias < 0) {
              quando = `${Math.abs(diffDias)} dia${Math.abs(diffDias) > 1 ? 's' : ''} atrasado`;
            } else if (diffDias === 0) {
              quando = 'Hoje';
            } else if (diffDias === 1) {
              quando = 'Amanhã';
            } else {
              quando = `Em ${diffDias} dias`;
            }

            const item: ProximaRevisao = {
              id: r.id,
              area: r.discipline || r.disciplina || 'Disciplina',
              topico: r.topicName || r.topico_nome || 'Tópico',
              quando,
              cards: 1,
              date: date
            };

            if (dateStr < hojeStr) {
              atrasadas.push(item);
            } else if (dateStr > hojeStr) {
              futuras.push(item);
            }
          });

          atrasadas.sort((a, b) => a.date.getTime() - b.date.getTime());
          futuras.sort((a, b) => a.date.getTime() - b.date.getTime());

          setRevisoesAtrasadas(atrasadas);
          setProximasRevisoes(futuras.slice(0, 5));

        } catch (error) {
          console.error('Erro ao carregar próximas revisões:', error);
        }

        const syncTime = readLastSync(clerkUserId);
        if (syncTime && syncTime !== '1970-01-01T00:00:00Z') {
          const date = new Date(syncTime);
          setLastSync(date.toLocaleTimeString());
        } else {
          setLastSync(null);
        }

      } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isLoaded) {
      loadAllData();
    }
  }, [studyRecords, getTotalErrors, user, isLoaded]);

  const handleSync = useCallback(async () => {
    if (!userId) {
      alert('Usuário não autenticado');
      return;
    }
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      console.log('🔄 Sincronização manual iniciada...');
      await syncWithSupabase(userId);
      const syncTime = readLastSync(userId);
      if (syncTime && syncTime !== '1970-01-01T00:00:00Z') {
        const date = new Date(syncTime);
        setLastSync(date.toLocaleTimeString());
      } else {
        setLastSync(null);
      }
      alert('✅ Sincronização concluída com sucesso!');
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
      alert('❌ Falha ao sincronizar. Verifique o console para mais detalhes.');
    } finally {
      setIsSyncing(false);
    }
  }, [userId, isSyncing]);

  useEffect(() => {
    const saved = localStorage.getItem('dashboard_checklist');
    const initialized = localStorage.getItem('dashboard_checklist_initialized');

    if (initialized && saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setChecklist(parsed);
          return;
        }
      } catch {
        // ignore
      }
    }

    if (!initialized) {
      setChecklist([]);
      localStorage.setItem('dashboard_checklist', JSON.stringify([]));
      localStorage.setItem('dashboard_checklist_initialized', 'true');
    } else {
      setChecklist([]);
      localStorage.setItem('dashboard_checklist', JSON.stringify([]));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('dashboard_checklist', JSON.stringify(checklist));
  }, [checklist]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dashboard_checklist' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setChecklist(parsed);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleChecklist = useCallback((id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, feito: !item.feito } : item
    ));
  }, []);

  const addChecklistItem = useCallback(() => {
    if (!newChecklistText.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      titulo: newChecklistText.trim(),
      feito: false,
    };
    setChecklist(prev => [...prev, newItem]);
    setNewChecklistText("");
    setIsAddingChecklist(false);
  }, [newChecklistText]);

  const removeChecklistItem = useCallback((id: string) => {
    setChecklist(prev => {
      const newList = prev.filter(item => item.id !== id);
      localStorage.setItem('dashboard_checklist', JSON.stringify(newList));
      return newList;
    });
  }, []);

  const tarefasRestantes = checklist.filter(c => !c.feito).length;
  const novos = dueCards.filter(c => c.reps === 0).length;
  const revisar = dueCards.filter(c => c.reps > 0).length;
  const atrasados = revisoesAtrasadas.length;

  if (loading || !isLoaded) {
    return (
      <AppShell breadcrumb="Início">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell breadcrumb="Início">
      <OnboardingTour />

      {/* CABEÇALHO: TÍTULO + BOTÃO REGISTRAR ESTUDO (sem card) */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Início</h1>
        <Link
          to="/calendario"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity self-start sm:self-auto"
        >
          <Calendar className="h-4 w-4" /> Registrar estudo
        </Link>
      </div>

      {/* CARD PRINCIPAL: DATA + SAUDAÇÃO + TAREFAS + PÍLULAS */}
      <div className="card-lip mb-6 p-6 sm:p-7">
        <p className="text-sm font-medium text-muted-foreground">{getDataPorExtenso()}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
          {getSaudacao()}, {userName.split(" ")[0]}.
        </h1>
        {tarefasRestantes > 0 && (
          <p className="mt-3 font-display text-xl font-semibold tracking-tight sm:text-2xl text-foreground">
            {tarefasRestantes === 1 ? (
              <>Falta <span className="highlight">1 tarefa</span> para fechar o seu dia.</>
            ) : (
              <>Faltam <span className="highlight">{tarefasRestantes} tarefas</span> para fechar o seu dia.</>
            )}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <MiniStat icon={<Flame className="h-5 w-5" />} label="Sequência" value={`${streak} dias`} />
          <MiniStat icon={<BookOpen className="h-5 w-5" />} label="Flashcards hoje" value={dueCards.length} />
          <MiniStat icon={<Target className="h-5 w-5" />} label="Dias até a prova" value={diasAteProva} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">

        <section className="card-lip p-5" style={{ '--lip': 'var(--primary)' } as React.CSSProperties}>
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Checklist de hoje</h2>
              <p className="text-xs text-muted-foreground">{checklist.filter(c => c.feito).length}/{checklist.length} concluídos</p>
            </div>
            <button
              onClick={() => setIsAddingChecklist(true)}
              className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              aria-label="Adicionar"
            >
              <Plus className="h-4 w-4" />
            </button>
          </header>

          {checklist.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma tarefa por aqui. Clique em + para adicionar.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {checklist.map((c) => (
                <li key={c.id} className="group flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2.5">
                  <button
                    onClick={() => toggleChecklist(c.id)}
                    className={[
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                      c.feito ? "border-primary bg-primary" : "border-foreground/30 group-hover:border-primary/60",
                    ].join(" ")}
                  >
                    {c.feito && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                  </button>
                  <span className={["text-sm flex-1 text-foreground", c.feito ? "opacity-40 line-through" : ""].join(" ")}>
                    {c.titulo}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(c.id)}
                    className="text-foreground/30 hover:text-destructive transition-colors md:opacity-0 md:group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 h-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-progress transition-all" style={{ width: `${checklist.length > 0 ? (checklist.filter(c => c.feito).length / checklist.length) * 100 : 0}%` }} />
          </div>
        </section>

        <section className="card-lip p-5 flex flex-col" style={{ '--lip': 'var(--primary)' } as React.CSSProperties}>
          <header className="mb-4">
            <h2 className="font-display text-base font-semibold text-foreground">Flashcards hoje</h2>
          </header>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <FlashStat label="Novos" value={novos} tone="success" />
            <FlashStat label="Revisar" value={revisar} tone="default" />
            <FlashStat label="Atrasados" value={atrasados} tone="destructive" />
          </div>

          <Link
            to="/flashcards"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Layers className="h-4 w-4" /> Começar revisão
          </Link>
        </section>

        <section className="card-lip p-5" style={{ '--lip': 'var(--accent)' } as React.CSSProperties}>
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Progresso por disciplina</h2>
              <p className="text-xs text-muted-foreground">Top 4 com base no plano de estudos</p>
            </div>
            <Link to="/conteudo" className="text-xs font-medium text-primary hover:underline">Ver todas</Link>
          </header>

          {disciplinasProgresso.length > 0 ? (
            <ul className="space-y-3.5">
              {disciplinasProgresso.map((d) => (
                <li key={d.nome}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-foreground">{d.nome}</span>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">{d.progresso}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${d.progresso}%`,
                        background: d.progresso >= 80
                          ? "var(--primary)"
                          : d.progresso >= 40
                          ? "linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--primary) 70%, var(--accent)))"
                          : "var(--accent)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma disciplina cadastrada.</p>
          )}
        </section>

        <section className="card-lip p-5" style={{ '--lip': 'var(--accent)' } as React.CSSProperties}>
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-foreground">Próximas revisões</h2>
            <Link to="/calendario" className="text-xs font-medium text-primary hover:underline">Ver agenda</Link>
          </header>

          {proximasRevisoes.length > 0 ? (
            <ul className="space-y-2">
              {proximasRevisoes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-background/60 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{p.topico}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{p.area}</div>
                  </div>
                  <span className={[
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                    p.quando === "Hoje"
                      ? "bg-primary text-primary-foreground"
                      : p.quando === "Amanhã"
                      ? "bg-[#F2C6A0] text-[#3A1F12]"
                      : "bg-foreground/10 text-foreground/70",
                  ].join(" ")}>
                    {p.quando}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma revisão futura agendada.</p>
          )}
        </section>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Última sincronização: {lastSync || 'Nunca'}
          </span>

          {revisoesAtrasadas.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-foreground/70">
              <AlertTriangle className="h-3 w-3 text-warning" />
              {revisoesAtrasadas.length} revisão{revisoesAtrasadas.length > 1 ? 'ões' : ''} atrasada{revisoesAtrasadas.length > 1 ? 's' : ''}
              <span className="text-foreground/30">·</span>
              <Link to="/calendario" className="text-primary hover:underline">
                ver no calendário
              </Link>
            </span>
          )}
        </div>

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Sincronizar agora
        </button>
      </div>

      {isAddingChecklist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <h3 className="text-lg font-semibold mb-4 text-foreground">Adicionar item ao checklist</h3>
            <input
              type="text"
              placeholder="Digite o item..."
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground mb-4"
              onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(); }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setIsAddingChecklist(false); setNewChecklistText(""); }}
                className="flex-1 rounded-full border border-border bg-background py-2 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={addChecklistItem}
                className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function MiniStat({ icon, label, value }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5">
      <div className="shrink-0 text-primary">
        {icon}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="font-display text-base font-bold tabular-nums text-foreground">{value}</div>
      </div>
    </div>
  );
}

function FlashStat({ label, value, tone = "default" }: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "destructive";
}) {
  const color = tone === "success"
    ? "text-success"
    : tone === "destructive"
    ? "text-destructive"
    : "text-foreground";

  return (
    <div className="rounded-2xl bg-background px-3 py-3 text-center">
      <div className={`font-display text-2xl font-bold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}