import { AppShell } from "@/components/app-shell";
import {
  ChevronLeft, ChevronRight, Plus, Clock, BookOpen, Brain,
  FileText, Trash2, X, CheckCircle, Sparkles, Loader2
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useStudy } from "@/contexts/StudyContext";
import { getDb } from "@/lib/db";
import { supabase, getSupabaseWithToken } from "@/lib/supabaseClient";
import { uid } from "@/utils/helpers";
import { updateTopicStatusAndRevisions } from "@/services/topicService";
import { enqueueOperation } from "@/services/queueService";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

interface Revisao {
  id: string;
  user_id: string;
  topico_id: string;
  topicName: string;
  discipline: string;
  review_level: number;
  nextReviewDate: string;
  lastStudyDate: string;
  completedAt: string | null;
  createdAt: string;
  updated_at: string;
}

const REVISAO_CORES: Record<number, string> = {
  1: "#FE7802",
  2: "#E8A87C",
  3: "#E0A5C0",
  4: "#D4A88E",
  5: "#C97FA8",
};

export default function CalendarioPage() {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [modo, setModo] = useState<"calendario" | "registrar">("calendario");
  const [tipo, setTipo] = useState<"teorico" | "pratico">("teorico");
  const [salvo, setSalvo] = useState(false);

  const [anoVisivel, setAnoVisivel] = useState(new Date().getFullYear());
  const [mesVisivel, setMesVisivel] = useState(new Date().getMonth());
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);

  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [disciplinas, setDisciplinas] = useState<{ id: string; name: string }[]>([]);
  const [topicos, setTopicos] = useState<{ id: string; name: string; discipline_id: string; status: string }[]>([]);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');

  const [isSaving, setIsSaving] = useState(false);
  const [concluindoRevisaoId, setConcluindoRevisaoId] = useState<string | null>(null);

  const dataSelecionada = diaSelecionado !== null
    ? `${anoVisivel}-${String(mesVisivel + 1).padStart(2, '0')}-${String(diaSelecionado).padStart(2, '0')}`
    : null;

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    duration: 90,
    discipline: 'Patologia Oral e Maxilofacial',
    topic: 'Lesões fundamentais',
    observations: '',
  });

  const [formMaterial, setFormMaterial] = useState('');
  const [formQuestions, setFormQuestions] = useState<number | string>(40);
  const [formCorrect, setFormCorrect] = useState<number | string>(32);
  const [formWrong, setFormWrong] = useState<number | string>(6);

  const studyContext = useStudy();
  const { records, addRecord, deleteRecord, getRecordsForDate, getMonthStats } = studyContext;

  useEffect(() => {
    const loadUserId = async () => {
      try {
        const cached = localStorage.getItem('revisaflash_user_id');
        if (cached) { setUserId(cached); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { setUserId(user.id); localStorage.setItem('revisaflash_user_id', user.id); }
      } catch (e) { console.warn('Não foi possível obter userId:', e); }
    };
    loadUserId();
  }, []);

  const loadRevisoes = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();
      const result = await db.revisoes.find({ selector: { user_id: userId } }).exec();
      setRevisoes(result.map((doc: any) => doc.toJSON()));
    } catch (error) { console.error('Erro ao carregar revisões:', error); }
  }, [userId]);

  const loadContentData = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();
      const disciplines = await db.disciplines.find({
        selector: { user_id: userId, isDeleted: { $ne: true } }
      }).exec();
      setDisciplinas(disciplines.map(d => ({ id: d.id, name: d.name })));

      const topics = await db.topics.find({
        selector: { user_id: userId, isDeleted: { $ne: true } }
      }).exec();
      setTopicos(topics.map(t => ({
        id: t.id, name: t.name, discipline_id: t.discipline_id, status: t.status
      })));
    } catch (error) { console.error('Erro ao carregar disciplinas/tópicos:', error); }
  }, [userId]);

  useEffect(() => {
    if (userId) { loadRevisoes(); loadContentData(); }
  }, [userId, loadRevisoes, loadContentData]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isSubscribed = true;
    const subscribeToRevisoes = async () => {
      try {
        const db = await getDb();
        if (!db.collections?.revisoes) return;
        const subscription = db.collections.revisoes.$.subscribe(() => {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            if (isSubscribed) loadRevisoes();
            timeoutId = null;
          }, 500);
        });
        return () => {
          isSubscribed = false;
          if (timeoutId) clearTimeout(timeoutId);
          subscription.unsubscribe();
        };
      } catch (e) { console.warn('Erro ao configurar listener de revisoes:', e); }
    };
    subscribeToRevisoes();
  }, [loadRevisoes]);

  const handleConcluirRevisao = useCallback(async (revisaoId: string) => {
    if (concluindoRevisaoId === revisaoId) return;
    if (!userId) return;
    setConcluindoRevisaoId(revisaoId);

    try {
      const db = await getDb();
      const now = new Date().toISOString();

      const doc = await db.revisoes.findOne({ selector: { id: revisaoId } }).exec();
      if (!doc) return;

      const revisao = doc.toJSON() as Revisao;
      const nivelAtual = revisao.review_level || 1;
      const topicoId = revisao.topico_id;

      await doc.patch({ completedAt: now, updated_at: now });
      setRevisoes(prev => prev.map(r => r.id === revisaoId ? { ...r, completedAt: now, updated_at: now } : r));

      const niveis = [
        { nivel: 1, dias: 1 }, { nivel: 2, dias: 7 }, { nivel: 3, dias: 15 },
        { nivel: 4, dias: 30 }, { nivel: 5, dias: 60 },
      ];

      let novaRevisao = null;
      if (nivelAtual < 5) {
        const proximoNivel = niveis.find(n => n.nivel === nivelAtual + 1);
        if (proximoNivel) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + proximoNivel.dias);
          novaRevisao = {
            id: uid(), user_id: userId, topico_id: topicoId,
            topicName: revisao.topicName, discipline: revisao.discipline,
            review_level: proximoNivel.nivel, nextReviewDate: nextDate.toISOString(),
            lastStudyDate: now, completedAt: null, createdAt: now, updated_at: now,
          };
          await db.revisoes.insert(novaRevisao);
          setRevisoes(prev => [...prev, novaRevisao]);
        }
      }

      let novoStatus = null;
      const topicoDoc = await db.topics.findOne({ selector: { id: topicoId } }).exec();
      if (topicoDoc) {
        const topicoData = topicoDoc.toJSON();
        const allRevisoes = await db.revisoes.find({ selector: { topico_id: topicoId } }).exec();
        const revisoesData = allRevisoes.map((d: any) => d.toJSON());
        const concluidas = revisoesData.filter(r => r.completedAt !== null).length;
        const total = revisoesData.length;

        let novoStatusTemp = topicoData.status;
        if (concluidas >= 1 && (topicoData.status === 'estudando' || topicoData.status === 'nao_estudado')) {
          novoStatusTemp = 'revisado';
        }
        if (total === 5 && concluidas === 5) novoStatusTemp = 'dominado';

        if (novoStatusTemp !== topicoData.status) {
          await topicoDoc.patch({ status: novoStatusTemp, updated_at: now });
          novoStatus = novoStatusTemp;
        }
      }

      try {
        const supabaseClient = await getSupabaseWithToken();
        await supabaseClient.from('revisoes').update({ completedAt: now, updated_at: now }).eq('id', revisaoId);
        if (novaRevisao) await supabaseClient.from('revisoes').insert(novaRevisao);
        if (novoStatus) await supabaseClient.from('topics').update({ status: novoStatus, updated_at: now }).eq('id', topicoId);
      } catch (supabaseError) {
        await enqueueOperation('update', 'revisoes', { id: revisaoId, completedAt: now, updated_at: now });
        if (novaRevisao) await enqueueOperation('create', 'revisoes', novaRevisao);
        if (novoStatus) await enqueueOperation('update', 'topics', { id: topicoId, status: novoStatus, updated_at: now });
      }

      await loadRevisoes();
    } catch (error) {
      console.error('❌ Erro ao concluir revisão:', error);
    } finally {
      setConcluindoRevisaoId(null);
    }
  }, [userId, loadRevisoes, concluindoRevisaoId]);

  const mesAnterior = () => {
    if (mesVisivel === 0) { setMesVisivel(11); setAnoVisivel(anoVisivel - 1); }
    else setMesVisivel(mesVisivel - 1);
    setDiaSelecionado(null);
  };

  const mesSeguinte = () => {
    if (mesVisivel === 11) { setMesVisivel(0); setAnoVisivel(anoVisivel + 1); }
    else setMesVisivel(mesVisivel + 1);
    setDiaSelecionado(null);
  };

  const irParaHoje = () => {
    const hoje = new Date();
    setAnoVisivel(hoje.getFullYear());
    setMesVisivel(hoje.getMonth());
    setDiaSelecionado(hoje.getDate());
  };

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const diaAtual = hoje.getDate();

  const primeiroDia = new Date(anoVisivel, mesVisivel, 1).getDay();
  const diasNoMes = new Date(anoVisivel, mesVisivel + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < primeiroDia; i++) cells.push(null);
  for (let d = 1; d <= diasNoMes; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthStats = getMonthStats(anoVisivel, mesVisivel);

  const daysWithStudy: Record<number, { teorico?: boolean; pratico?: boolean }> = {};
  for (let d = 1; d <= diasNoMes; d++) {
    const dateStr = `${anoVisivel}-${String(mesVisivel + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRecords = getRecordsForDate(dateStr);
    if (dayRecords.length > 0) {
      daysWithStudy[d] = {
        teorico: dayRecords.some(r => r.type === 'teorico'),
        pratico: dayRecords.some(r => r.type === 'pratico'),
      };
    }
  }

  const registrosDoDia = dataSelecionada ? getRecordsForDate(dataSelecionada) : [];
  const dataFormatada = dataSelecionada
    ? new Date(dataSelecionada).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const revisoesDoDia = dataSelecionada
    ? revisoes.filter(r => {
        if (!r.nextReviewDate || r.completedAt) return false;
        const date = new Date(r.nextReviewDate);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return dateStr === dataSelecionada;
      })
    : [];

  const handleSalvar = async () => {
    if (isSaving) return;
    if (!selectedTopicId) { toast.warning('Selecione um tópico para registrar o estudo.'); return; }

    const topic = topicos.find(t => t.id === selectedTopicId);
    if (!topic) { toast.error('Tópico não encontrado.'); return; }

    const disciplina = disciplinas.find(d => d.id === selectedDisciplineId);

    const recordData = {
      date: formData.date,
      type: tipo,
      discipline: disciplina?.name || '',
      topic: topic.name,
      duration: formData.duration,
      observations: formData.observations,
      ...(tipo === 'teorico'
        ? { material: formMaterial }
        : {
            questionsCount: Number(formQuestions) || 0,
            correctCount: Number(formCorrect) || 0,
            wrongCount: Number(formWrong) || 0,
          }
      ),
    };

    setIsSaving(true);
    try {
      await addRecord(recordData);

      if (tipo === 'teorico' && userId) {
        const currentStatus = topic.status;
        let newStatus = currentStatus;
        if (currentStatus === 'nao_estudado') newStatus = 'estudando';

        if (newStatus !== currentStatus) {
          try {
            await updateTopicStatusAndRevisions(selectedTopicId, newStatus, userId, formData.date);
            await loadContentData();
          } catch (error) {
            console.error('⚠️ Erro ao atualizar tópico, mas o registro foi salvo:', error);
          }
        }
      }

      setSalvo(true);
      setTimeout(() => { setSalvo(false); setModo("calendario"); }, 1500);
    } catch (error) {
      console.error('❌ Erro ao salvar estudo:', error);
      toast.error('Erro ao salvar registro', { description: 'Verifique o console para mais detalhes.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir este registro?",
      description: "O registro de estudo deste dia será removido.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (ok) {
      deleteRecord(id);
      toast.success("Registro excluído");
    }
  };

  if (modo === "calendario") {
    const nomeMes = new Date(anoVisivel, mesVisivel).toLocaleString('pt-BR', { month: 'long' });
    const tituloMes = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} ${anoVisivel}`;
    const isDiaSelecionadoHoje = diaSelecionado === diaAtual && anoVisivel === anoAtual && mesVisivel === mesAtual;
    const tituloSidebar = isDiaSelecionadoHoje
      ? `Hoje, ${String(diaAtual).padStart(2, '0')}/${String(mesAtual + 1).padStart(2, '0')}`
      : dataFormatada;

    return (
      <AppShell breadcrumb="Calendário" title="Agenda de estudos">
        <div id="calendario-header">
          {salvo && (
            <div className="mb-4 rounded-xl border border-success/20 bg-success/10 p-3 text-sm text-success">
              ✅ Estudo registrado com sucesso!
            </div>
          )}

          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setModo("registrar")}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" /> Registrar estudo
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rf-card p-5 lg:col-span-2">
              <header className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-lg font-bold">{tituloMes}</h2>
                  <div className="flex items-center gap-1">
                    <button onClick={mesAnterior} className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-white/5" aria-label="Mês anterior">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={mesSeguinte} className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-white/5" aria-label="Próximo mês">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={irParaHoje} className="ml-1 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-foreground/60 hover:bg-white/5">
                      Hoje
                    </button>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-7 gap-2">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <div key={i} className="px-2 py-2 text-center text-[10px] font-medium tracking-widest text-foreground/40">
                    {d}
                  </div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="aspect-square sm:aspect-auto sm:h-[68px]" />;
                  const e = daysWithStudy[d];
                  const isHoje = d === diaAtual && anoVisivel === anoAtual && mesVisivel === mesAtual;
                  const isSelecionado = d === diaSelecionado;

                  return (
                    <button
                      key={i}
                      onClick={() => setDiaSelecionado(d)}
                      className={[
                        "relative rounded-2xl p-2 transition-all aspect-square sm:aspect-auto sm:h-[68px] w-full text-left",
                        isSelecionado
                          ? "bg-primary text-primary-foreground"
                          : isHoje
                          ? "bg-surface-2/60 ring-1 ring-inset ring-primary/50 hover:bg-accent/40 text-foreground/80"
                          : "bg-surface-2/60 hover:bg-accent/40 text-foreground/80",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "text-xs font-medium tabular-nums",
                          isSelecionado ? "" : "text-foreground/80",
                        ].join(" ")}
                      >
                        {d}
                      </span>
                      {e && (
                        <div className="absolute bottom-1.5 left-2 flex gap-1">
                          {e.teorico && <span className={`h-1.5 w-1.5 rounded-full ${isSelecionado ? "bg-white" : "bg-primary"}`} />}
                          {e.pratico && <span className={`h-1.5 w-1.5 rounded-full ${isSelecionado ? "bg-white" : "bg-accent"}`} />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-foreground/50">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Teórico
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Prático
                </span>
                <span className="ml-auto text-foreground/40">
                  Clique em um dia para ver os registros
                </span>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rf-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold">
                    {diaSelecionado !== null ? tituloSidebar : "Selecione um dia"}
                  </h3>
                  {diaSelecionado !== null && (
                    <button onClick={() => setDiaSelecionado(null)} className="text-foreground/40 hover:text-foreground transition-colors" aria-label="Limpar seleção">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {diaSelecionado !== null ? (
                  <>
                    {revisoesDoDia.length > 0 && (
                      <ul className="space-y-2">
                        {revisoesDoDia.map((rev) => {
                          const cor = REVISAO_CORES[rev.review_level] || "#E8A87C";
                          return (
                            <li key={rev.id}>
                              <button
                                onClick={() => handleConcluirRevisao(rev.id)}
                                disabled={concluindoRevisaoId === rev.id}
                                className="w-full flex items-center justify-between gap-3 rounded-full bg-background/40 px-4 py-2.5 hover:bg-background/60 transition-colors text-left disabled:opacity-50"
                              >
                                <span className="truncate text-sm font-medium">
                                  {rev.topicName}
                                </span>
                                <span
                                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                                  style={{
                                    backgroundColor: cor,
                                    color: '#290E1F',
                                  }}
                                >
                                  {concluindoRevisaoId === rev.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    `Revisão D${rev.review_level}`
                                  )}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {registrosDoDia.length > 0 && (
                      <div className={revisoesDoDia.length > 0 ? "border-t border-border/60 pt-4 mt-4" : ""}>
                        <p className="text-xs text-foreground/45 mb-2 flex items-center gap-1.5">
                          <BookOpen className="h-3 w-3" />
                          {registrosDoDia.length} registro{registrosDoDia.length !== 1 ? 's' : ''} de estudo
                        </p>
                        <ul className="space-y-2">
                          {registrosDoDia.map((r) => (
                            <li
                              key={r.id}
                              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3 group"
                            >
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                {r.discipline.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{r.discipline}</div>
                                <div className="truncate text-[11px] text-foreground/45">
                                  {new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  {r.questionsCount ? ` · ${r.questionsCount} questões` : ''}
                                  {r.duration ? ` · ${r.duration}min` : ''}
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteRecord(r.id)}
                                className="text-foreground/30 hover:text-destructive transition-colors md:opacity-0 md:group-hover:opacity-100"
                                aria-label="Excluir registro"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {revisoesDoDia.length === 0 && registrosDoDia.length === 0 && (
                      <p className="text-center text-sm text-foreground/40 py-6">
                        Nenhum estudo ou revisão neste dia.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-[100px] items-center justify-center text-center">
                    <p className="text-sm text-foreground/40">
                      Clique em um dia no calendário<br />
                      para ver os registros e revisões.
                    </p>
                  </div>
                )}
              </div>

              <div className="rf-card p-5">
                <h3 className="mb-3 font-display text-sm font-semibold">
                  Resumo de {nomeMes}
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-center">
                  <Stat label="Dias estudados" value={String(monthStats.totalDays)} />
                  <Stat label="Horas totais" value={`${monthStats.totalHours}h`} />
                  <Stat label="Questões" value={String(monthStats.totalQuestions)} />
                  <Stat label="Acertos" value={`${monthStats.averageCorrectRate}%`} />
                </dl>
              </div>
            </aside>
          </div>
        </div>
      </AppShell>
    );
  }

  if (modo === "registrar") {
    return (
      <AppShell breadcrumb="Calendário · Registrar estudo" title="Registrar estudo">
        <button
          onClick={() => setModo("calendario")}
          className="-mt-2 mb-6 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao calendário
        </button>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-5 lg:col-span-2">
            <div className="rf-card p-6">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-foreground/40">Tipo de estudo</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <TipoCard
                  icon={<BookOpen className="h-4 w-4" />}
                  label="Teórico"
                  desc="Leitura, resumo, videoaula"
                  active={tipo === "teorico"}
                  onClick={() => setTipo("teorico")}
                />
                <TipoCard
                  icon={<Brain className="h-4 w-4" />}
                  label="Prático (Questões)"
                  desc="Banco de questões, resolução"
                  active={tipo === "pratico"}
                  onClick={() => setTipo("pratico")}
                />
              </div>
            </div>

            {tipo === "teorico" ? (
              <TeoricoForm
                formData={formData} setFormData={setFormData}
                formMaterial={formMaterial} setFormMaterial={setFormMaterial}
                disciplinas={disciplinas} topicos={topicos}
                selectedDisciplineId={selectedDisciplineId} setSelectedDisciplineId={setSelectedDisciplineId}
                selectedTopicId={selectedTopicId} setSelectedTopicId={setSelectedTopicId}
              />
            ) : (
              <PraticoForm
                formData={formData} setFormData={setFormData}
                formQuestions={formQuestions} setFormQuestions={setFormQuestions}
                formCorrect={formCorrect} setFormCorrect={setFormCorrect}
                formWrong={formWrong} setFormWrong={setFormWrong}
                disciplinas={disciplinas} topicos={topicos}
                selectedDisciplineId={selectedDisciplineId} setSelectedDisciplineId={setSelectedDisciplineId}
                selectedTopicId={selectedTopicId} setSelectedTopicId={setSelectedTopicId}
              />
            )}
          </section>

          <aside className="space-y-4">
            <div className="rf-card p-5">
              <header className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-foreground/40">
                <FileText className="h-3 w-3 text-primary" /> Resumo
              </header>
              <ul className="space-y-2 text-xs">
                <Row k="Tipo" v={tipo === "teorico" ? "Teórico" : "Prático"} />
                <Row k="Data" v={formData.date} />
                <Row k="Disciplina" v={disciplinas.find(d => d.id === selectedDisciplineId)?.name || '—'} />
                <Row k="Tópico" v={topicos.find(t => t.id === selectedTopicId)?.name || '—'} />
                {tipo === "teorico" ? (
                  <Row k="Duração" v={`${formData.duration} min`} />
                ) : (
                  <>
                    <Row k="Questões" v={String(formQuestions)} />
                    <Row k="Acertos" v={String(formCorrect)} />
                    <Row k="Erros" v={String(formWrong)} />
                  </>
                )}
              </ul>
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-[11px] text-foreground/70">
                Esse registro entra na sua sequência diária e na heatmap de desempenho.
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-8 flex items-center justify-end gap-2">
          <button
            onClick={() => setModo("calendario")}
            className="rounded-full px-4 py-2 text-sm font-medium text-foreground/65 hover:bg-white/5"
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={isSaving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSaving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>) : ('Salvar estudo')}
          </button>
        </footer>
      </AppShell>
    );
  }

  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/40 p-3">
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-foreground/40">{label}</div>
    </div>
  );
}

function TipoCard({ icon, label, desc, active, onClick }: {
  icon: React.ReactNode; label: string; desc: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
        active ? "border-primary/60 bg-primary/5" : "border-border bg-background hover:border-primary/40",
      ].join(" ")}
    >
      <div className={["grid h-9 w-9 place-items-center rounded-lg", active ? "bg-primary/15 text-primary" : "bg-white/5 text-foreground/55"].join(" ")}>
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-foreground/50">{desc}</div>
      </div>
      {active && <span className="ml-auto h-2 w-2 rounded-full bg-primary" />}
    </button>
  );
}

function TeoricoForm({
  formData, setFormData, formMaterial, setFormMaterial,
  disciplinas, topicos,
  selectedDisciplineId, setSelectedDisciplineId,
  selectedTopicId, setSelectedTopicId,
}: any) {
  return (
    <div className="rf-card p-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-foreground/40">Detalhes</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data">
          <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Duração (min)">
          <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Disciplina">
          <select
            value={selectedDisciplineId}
            onChange={(e) => { setSelectedDisciplineId(e.target.value); setSelectedTopicId(''); }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Selecione uma disciplina</option>
            {disciplinas.map((d: any) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </Field>
        <Field label="Tópico">
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
            disabled={!selectedDisciplineId}
          >
            <option value="">Selecione um tópico</option>
            {topicos.filter((t: any) => t.discipline_id === selectedDisciplineId).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Material consultado">
          <input type="text" value={formMaterial} onChange={(e) => setFormMaterial(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Observações">
          <textarea rows={3} value={formData.observations} onChange={(e) => setFormData({ ...formData, observations: e.target.value })} placeholder="Resumo, dúvidas que ficaram, próximos passos…" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
      </div>
    </div>
  );
}

function PraticoForm({
  formData, setFormData, formQuestions, setFormQuestions, formCorrect, setFormCorrect,
  formWrong, setFormWrong, disciplinas, topicos,
  selectedDisciplineId, setSelectedDisciplineId, selectedTopicId, setSelectedTopicId,
}: any) {
  const handleNumberChange = (value: string, setter: (v: number | string) => void) => {
    if (value === '') setter('');
    else { const num = Number(value); if (!isNaN(num) && num >= 0) setter(num); }
  };

  return (
    <div className="rf-card p-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-foreground/40">Detalhes da prática</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data">
          <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Duração (min)">
          <input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Disciplina">
          <select
            value={selectedDisciplineId}
            onChange={(e) => { setSelectedDisciplineId(e.target.value); setSelectedTopicId(''); }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Selecione uma disciplina</option>
            {disciplinas.map((d: any) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </Field>
        <Field label="Tópico">
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
            disabled={!selectedDisciplineId}
          >
            <option value="">Selecione um tópico</option>
            {topicos.filter((t: any) => t.discipline_id === selectedDisciplineId).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Questões feitas">
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={formQuestions} onChange={(e) => handleNumberChange(e.target.value, setFormQuestions)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Acertos">
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={formCorrect} onChange={(e) => handleNumberChange(e.target.value, setFormCorrect)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
        <Field label="Erros">
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={formWrong} onChange={(e) => handleNumberChange(e.target.value, setFormWrong)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Observações">
          <textarea rows={3} value={formData.observations} onChange={(e) => setFormData({ ...formData, observations: e.target.value })} placeholder="Tópicos errados, padrões de erro, revisões agendadas…" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-foreground/50">{k}</span>
      <span className="font-medium text-foreground/85">{v}</span>
    </li>
  );
}