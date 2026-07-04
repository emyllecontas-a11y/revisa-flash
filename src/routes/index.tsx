import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import {
  Check, Plus, Clock, ArrowUpRight, Flame, Target, BookOpen, AlertTriangle, X
} from "lucide-react";
import { useStudy } from "@/contexts/StudyContext";
import { useErrors } from "@/contexts/ErrorContext";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { useAppUser } from "@/contexts/UserContext";
import { getDb } from "@/lib/db";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { OnboardingTour } from "@/components/OnboardingTour";

// ============================================================
// TIPOS
// ============================================================
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

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
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

  const [provaNome, setProvaNome] = useState<string>("ENARE 2026");
  const [provaData, setProvaData] = useState<Date | null>(null);

  const studyContext = useStudy();
  const { records: studyRecords } = studyContext;
  const errorContext = useErrors();
  const { getTotalErrors } = errorContext;
  const flashcardContext = useFlashcardContext();
  const { dueCards, decks } = flashcardContext;

  // ============================================================
  // SAUDAÇÃO DINÂMICA
  // ============================================================
  const getSaudacao = () => {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
  };

  // ============================================================
  // CARREGAR DADOS
  // ============================================================
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
            selector: { user_id: clerkUserId, deletedAt: { $eq: null } }
          }).exec();
          const disciplinas = disciplinesResult.map((doc: any) => doc.toJSON());

          const topicsResult = await db.topics.find({
            selector: { user_id: clerkUserId, deletedAt: { $eq: null } }
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

          const proximas = revisoes
            .filter(r => {
              if (!r.nextReviewDate || r.completedAt) return false;
              const date = new Date(r.nextReviewDate);
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              return dateStr > hojeStr;
            })
            .sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime())
            .slice(0, 5)
            .map(r => {
              const date = new Date(r.nextReviewDate);
              const diffDias = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              const quando = diffDias === 1 ? 'Amanhã' : `Em ${diffDias} dias`;
              return {
                id: r.id,
                area: r.discipline || r.disciplina || 'Disciplina',
                topico: r.topicName || r.topico_nome || 'Tópico',
                quando,
                cards: 1,
                date: date
              };
            });
          setProximasRevisoes(proximas);
        } catch (error) {
          console.error('Erro ao carregar próximas revisões:', error);
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

  // ============================================================
  // CHECKLIST
  // ============================================================
  useEffect(() => {
    const saved = localStorage.getItem('dashboard_checklist');
    if (saved) {
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
    // Define itens padrão apenas se não houver nada salvo
    const defaultItems: ChecklistItem[] = [
      { id: crypto.randomUUID(), titulo: 'Revisar flashcards devidos', feito: false },
      { id: crypto.randomUUID(), titulo: 'Estudar 1 disciplina', feito: false },
      { id: crypto.randomUUID(), titulo: 'Anotar erros do dia', feito: false },
    ];
    setChecklist(defaultItems);
    localStorage.setItem('dashboard_checklist', JSON.stringify(defaultItems));
  }, []);

  // 🔥 Sincroniza com localStorage sempre que o checklist mudar
  useEffect(() => {
    localStorage.setItem('dashboard_checklist', JSON.stringify(checklist));
  }, [checklist]);

  // 🔥 Escuta mudanças no localStorage (para sincronizar entre abas)
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
    setChecklist(prev => prev.filter(item => item.id !== id));
  }, []);

  // ============================================================
  // RENDER
  // ============================================================
  if (loading || !isLoaded) {
    return (
      <AppShell breadcrumb="Início" title="Carregando...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell breadcrumb="Início" title={`${getSaudacao()}, ${userName.split(" ")[0]}.`}>
      <OnboardingTour />

      <p className="-mt-4 mb-8 max-w-2xl text-sm text-foreground/55">
        Você tem <span className="font-medium text-primary">{dueCards.length} flashcards</span> para revisar hoje
        e <span className="font-medium text-accent">{diasAteProva} dias</span> até a <span className="font-medium text-foreground">{provaNome}</span>.
      </p>

      <div className="grid grid-cols-12 gap-4">
        <div id="dashboard-stats" className="col-span-12 grid grid-cols-12 gap-4">
          <StatCard icon={<Flame className="h-4 w-4" />} label="Sequência" value={`${streak} dias`} tone="accent" />
          <StatCard icon={<BookOpen className="h-4 w-4" />} label="Flashcards hoje" value={dueCards.length} hint={`${decks.length} decks`} />
          <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Erros ativos" value={totalErros} hint="banco de erros" tone="accent" />
          <StatCard icon={<Target className="h-4 w-4" />} label="Dias até a prova" value={diasAteProva} hint={provaNome} />
        </div>

        <section id="dashboard-checklist" className="col-span-12 rf-card p-5 lg:col-span-5">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Checklist de hoje</h2>
              <p className="text-xs text-foreground/45">{checklist.filter(c => c.feito).length}/{checklist.length} concluídos</p>
            </div>
            <button
              onClick={() => setIsAddingChecklist(true)}
              className="grid h-7 w-7 place-items-center rounded-md border border-border text-foreground/60 hover:bg-white/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </header>
          <ul className="space-y-2.5">
            {checklist.map((c) => (
              <li key={c.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/3">
                <button
                  onClick={() => toggleChecklist(c.id)}
                  className={[
                    "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                    c.feito ? "border-primary bg-primary" : "border-foreground/25 group-hover:border-primary/60",
                  ].join(" ")}
                >
                  {c.feito && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                </button>
                <span className={["text-sm flex-1", c.feito ? "text-foreground/40 line-through decoration-foreground/20" : "text-foreground/90"].join(" ")}>
                  {c.titulo}
                </span>
                <button
                  onClick={() => removeChecklistItem(c.id)}
                  className="text-foreground/20 hover:text-red-400 transition-colors md:opacity-0 md:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${checklist.length > 0 ? (checklist.filter(c => c.feito).length / checklist.length) * 100 : 0}%` }} />
          </div>

          {isAddingChecklist && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
                <h3 className="text-lg font-semibold mb-4">Adicionar item ao checklist</h3>
                <input
                  type="text"
                  placeholder="Digite o item..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mb-4"
                  onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(); }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsAddingChecklist(false); setNewChecklistText(""); }}
                    className="flex-1 rounded-lg border border-border bg-background py-2 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={addChecklistItem}
                    className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-colors"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section id="dashboard-flashcards" className="col-span-12 rf-card p-5 lg:col-span-7">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Flashcards hoje</h2>
              <p className="text-xs text-foreground/45">Os próximos cards que você precisa revisar</p>
            </div>
            <Link to="/flashcards" className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
              Estudar agora <ArrowUpRight className="h-3 w-3" />
            </Link>
          </header>
          {dueCards.slice(0, 10).length > 0 ? (
            <ul className="divide-y divide-border">
              {dueCards.slice(0, 10).map((card) => {
                const deckName = decks.find(d => d.id === card.deck_id)?.name || 'Sem deck';
                return (
                  <li key={card.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-xs font-semibold text-primary">
                      {deckName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{card.front}</div>
                      <div className="truncate text-xs text-foreground/45">{deckName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-foreground/50">
                        {new Date(card.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="text-xs font-medium text-foreground">{card.reps} reps</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-6">Nenhum flashcard devido hoje. 🎉</p>
          )}
          {dueCards.length > 10 && (
            <div className="mt-3 text-center text-xs text-foreground/40">
              + {dueCards.length - 10} cards a mais
            </div>
          )}
        </section>

        <section id="dashboard-progress" className="col-span-12 rf-card p-5 lg:col-span-7">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Progresso por disciplina</h2>
              <p className="text-xs text-foreground/45">Top 4 com base no plano de estudos</p>
            </div>
            <Link to="/conteudo" className="text-xs font-medium text-primary hover:underline">Ver todas</Link>
          </header>
          {disciplinasProgresso.length > 0 ? (
            <ul className="space-y-3">
              {disciplinasProgresso.map((d) => (
                <li key={d.nome}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">{d.nome}</span>
                    <span className="text-xs font-medium tabular-nums text-foreground/70">{d.progresso}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={["h-full rounded-full transition-all", d.progresso >= 80 ? "bg-primary" : d.progresso >= 40 ? "bg-primary/70" : "bg-accent/70"].join(" ")}
                      style={{ width: `${d.progresso}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-4">Nenhuma disciplina cadastrada.</p>
          )}
        </section>

        <section id="dashboard-reviews" className="col-span-12 rf-card p-5 lg:col-span-5">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Próximas revisões</h2>
            <Link to="/calendario" className="text-xs font-medium text-primary hover:underline">Ver agenda</Link>
          </header>
          {proximasRevisoes.length > 0 ? (
            <ul className="space-y-3">
              {proximasRevisoes.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 rf-card-hover">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/10 text-[10px] font-semibold text-accent">
                    {p.area.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.area}</div>
                    <div className="truncate text-[11px] text-foreground/45">{p.topico}</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-medium text-foreground/80">{p.quando}</div>
                    <div className="text-foreground/40">{p.cards} card</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/40 text-center py-4">Nenhuma revisão futura agendada.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

// ============================================================
// COMPONENTE STATCARD
// ============================================================
function StatCard({ icon, label, value, hint, tone = "primary" }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone?: "primary" | "accent" }) {
  return (
    <div className="col-span-6 rf-card p-4 sm:col-span-3 rf-card-hover">
      <div className={["mb-3 inline-flex h-7 w-7 items-center justify-center rounded-md", tone === "accent" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"].join(" ")}>
        {icon}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-foreground/40">{hint}</div>}
    </div>
  );
}