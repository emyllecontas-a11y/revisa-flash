import { AppShell } from "@/components/app-shell";
import {
  ChevronLeft, ChevronRight, Plus, Clock, BookOpen, Brain,
  FileText, Trash2, X, CheckCircle, Circle, Calendar as CalendarIcon, Sparkles, Loader2
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useStudy } from "@/contexts/StudyContext";
import { getDb } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { uid } from "@/utils/helpers";
import { updateTopicStatusAndRevisions } from "@/services/topicService";

// ============================================================
// TIPOS
// ============================================================
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
  updatedAt: string;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function CalendarioPage() {
  const [modo, setModo] = useState<"calendario" | "registrar">("calendario");
  const [tipo, setTipo] = useState<"teorico" | "pratico">("teorico");
  const [salvo, setSalvo] = useState(false);

  // Estados do calendário
  const [anoVisivel, setAnoVisivel] = useState(new Date().getFullYear());
  const [mesVisivel, setMesVisivel] = useState(new Date().getMonth());
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);

  // Estados das revisões
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Estados para disciplinas e tópicos
  const [disciplinas, setDisciplinas] = useState<{ id: string; name: string }[]>([]);
  const [topicos, setTopicos] = useState<{ id: string; name: string; discipline_id: string; status: string }[]>([]);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');

  // 🔥 NOVOS ESTADOS DE CARREGAMENTO
  const [isSaving, setIsSaving] = useState(false);
  const [concluindoRevisaoId, setConcluindoRevisaoId] = useState<string | null>(null);

  const dataSelecionada = diaSelecionado !== null
    ? `${anoVisivel}-${String(mesVisivel + 1).padStart(2, '0')}-${String(diaSelecionado).padStart(2, '0')}`
    : null;

  // ============================================================
  // FORMULÁRIO
  // ============================================================
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    duration: 90,
    discipline: 'Patologia Oral e Maxilofacial',
    topic: 'Lesões fundamentais',
    observations: '',
  });

  const [formMaterial, setFormMaterial] = useState('');
  const [formQuestions, setFormQuestions] = useState(40);
  const [formCorrect, setFormCorrect] = useState(32);
  const [formWrong, setFormWrong] = useState(6);

  // Contexto de estudos
  const studyContext = useStudy();
  const { records, addRecord, deleteRecord, getRecordsForDate, getMonthStats } = studyContext;

  // ============================================================
  // CARREGAR USER ID, REVISÕES, DISCIPLINAS E TÓPICOS
  // ============================================================
  useEffect(() => {
    const loadUserId = async () => {
      try {
        const cached = localStorage.getItem('revisaflash_user_id');
        if (cached) {
          setUserId(cached);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          localStorage.setItem('revisaflash_user_id', user.id);
        }
      } catch (e) {
        console.warn('Não foi possível obter userId:', e);
      }
    };
    loadUserId();
  }, []);

  const loadRevisoes = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();
      const result = await db.revisoes.find({
        selector: { user_id: userId }
      }).exec();
      const data = result.map((doc: any) => doc.toJSON());
      setRevisoes(data);
    } catch (error) {
      console.error('Erro ao carregar revisões:', error);
    }
  }, [userId]);

  const loadContentData = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();
      const disciplines = await db.disciplines.find({
        selector: { user_id: userId, deletedAt: { $eq: null } }
      }).exec();
      setDisciplinas(disciplines.map(d => ({ id: d.id, name: d.name })));

      const topics = await db.topics.find({
        selector: { user_id: userId, deletedAt: { $eq: null } }
      }).exec();
      setTopicos(topics.map(t => ({
        id: t.id,
        name: t.name,
        discipline_id: t.discipline_id,
        status: t.status
      })));
    } catch (error) {
      console.error('Erro ao carregar disciplinas/tópicos:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadRevisoes();
      loadContentData();
    }
  }, [userId, loadRevisoes, loadContentData]);

  // ============================================================
  // FUNÇÃO PARA CONCLUIR UMA REVISÃO (CORRIGIDA)
  // ============================================================
const handleConcluirRevisao = useCallback(async (revisaoId: string) => {
  if (concluindoRevisaoId === revisaoId) return;
  if (!userId) return;

  setConcluindoRevisaoId(revisaoId);

  try {
    const db = await getDb();
    const now = new Date().toISOString();

    // 1. Buscar a revisão atual
    const doc = await db.revisoes.findOne({ selector: { id: revisaoId } }).exec();
    if (!doc) {
      console.warn('⚠️ Revisão não encontrada');
      return;
    }

    const revisao = doc.toJSON() as Revisao;
    const nivelAtual = revisao.review_level || 1;
    const topicoId = revisao.topico_id;

    // 2. Marcar a revisão atual como concluída
    await doc.patch({
      completedAt: now,
      updatedAt: now,
    });

    setRevisoes(prev =>
      prev.map(r =>
        r.id === revisaoId
          ? { ...r, completedAt: now, updatedAt: now }
          : r
      )
    );

    // 🔥 ENFILEIRA A ATUALIZAÇÃO DA REVISÃO CONCLUÍDA
    await enqueueOperation('update', 'revisoes', {
      id: revisaoId,
      completedAt: now,
      updatedAt: now,
    });

    // 3. Se não for o nível 5, criar a próxima revisão
    const niveis = [
      { nivel: 1, dias: 1 },
      { nivel: 2, dias: 7 },
      { nivel: 3, dias: 15 },
      { nivel: 4, dias: 30 },
      { nivel: 5, dias: 60 },
    ];

    if (nivelAtual < 5) {
      const proximoNivel = niveis.find(n => n.nivel === nivelAtual + 1);
      if (proximoNivel) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + proximoNivel.dias);

        const newRevisao = {
          id: uid(),
          user_id: userId,
          topico_id: topicoId,
          topicName: revisao.topicName,
          discipline: revisao.discipline,
          review_level: proximoNivel.nivel,
          nextReviewDate: nextDate.toISOString(),
          lastStudyDate: now,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        await db.revisoes.insert(newRevisao);
        setRevisoes(prev => [...prev, newRevisao]);

        // 🔥 ENFILEIRA A CRIAÇÃO DA NOVA REVISÃO
        await enqueueOperation('create', 'revisoes', newRevisao);
      }
    }

    // 4. Atualizar status do tópico (enfileirando a operação)
    const topicoDoc = await db.topics.findOne({ selector: { id: topicoId } }).exec();
    if (topicoDoc) {
      const topicoData = topicoDoc.toJSON();
      const allRevisoes = await db.revisoes.find({ selector: { topico_id: topicoId } }).exec();
      const revisoesData = allRevisoes.map((d: any) => d.toJSON());
      const concluidas = revisoesData.filter(r => r.completedAt !== null).length;
      const total = revisoesData.length;

      let novoStatus = topicoData.status;
      if (concluidas >= 1 && (topicoData.status === 'estudando' || topicoData.status === 'nao_estudado')) {
        novoStatus = 'revisado';
      }
      if (total === 5 && concluidas === 5) {
        novoStatus = 'dominado';
      }

      if (novoStatus !== topicoData.status) {
        await topicoDoc.patch({
          status: novoStatus,
          updatedAt: now,
        });

        // 🔥 ENFILEIRA A ATUALIZAÇÃO DO TÓPICO
        await enqueueOperation('update', 'topics', {
          id: topicoId,
          status: novoStatus,
          updatedAt: now,
        });
      }
    }

    await loadRevisoes();
    console.log('✅ Revisão concluída com sucesso (enfileirada)');

  } catch (error) {
    console.error('❌ Erro ao concluir revisão:', error);
  } finally {
    setConcluindoRevisaoId(null);
  }
}, [userId, loadRevisoes, concluindoRevisaoId]);

  // ============================================================
  // NAVEGAÇÃO
  // ============================================================
  const mesAnterior = () => {
    if (mesVisivel === 0) {
      setMesVisivel(11);
      setAnoVisivel(anoVisivel - 1);
    } else {
      setMesVisivel(mesVisivel - 1);
    }
    setDiaSelecionado(null);
  };

  const mesSeguinte = () => {
    if (mesVisivel === 11) {
      setMesVisivel(0);
      setAnoVisivel(anoVisivel + 1);
    } else {
      setMesVisivel(mesVisivel + 1);
    }
    setDiaSelecionado(null);
  };

  const irParaHoje = () => {
    const hoje = new Date();
    setAnoVisivel(hoje.getFullYear());
    setMesVisivel(hoje.getMonth());
    setDiaSelecionado(hoje.getDate());
  };

  // ============================================================
  // DADOS DO CALENDÁRIO
  // ============================================================
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

  // Dias com estudo
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

  // Registros do dia selecionado
  const registrosDoDia = dataSelecionada ? getRecordsForDate(dataSelecionada) : [];
  const dataFormatada = dataSelecionada
    ? new Date(dataSelecionada).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // Revisões do dia selecionado (buscando por nextReviewDate)
  const revisoesDoDia = dataSelecionada
    ? revisoes.filter(r => {
        if (!r.nextReviewDate || r.completedAt) return false;
        const date = new Date(r.nextReviewDate);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return dateStr === dataSelecionada;
      })
    : [];

  // ============================================================
  // FUNÇÃO PARA SALVAR ESTUDO (CORRIGIDA)
  // ============================================================
  const handleSalvar = async () => {
    // 🔥 Impede múltiplos cliques
    if (isSaving) return;

    // Verifica se há um tópico selecionado
    if (!selectedTopicId) {
      alert('Selecione um tópico para registrar o estudo.');
      return;
    }

    const topic = topicos.find(t => t.id === selectedTopicId);
    if (!topic) {
      alert('Tópico não encontrado.');
      return;
    }

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
            questionsCount: formQuestions,
            correctCount: formCorrect,
            wrongCount: formWrong,
          }
      ),
    };

    console.log('📝 Dados do registro de estudo:', recordData);

    setIsSaving(true);

    try {
      // 1. Criar registro de estudo (o contexto adiciona user_id e createdAt)
      await addRecord(recordData);
      console.log('✅ Registro de estudo criado com sucesso.');

      // 2. Atualizar status do tópico (se necessário)
      const currentStatus = topic.status;
      let newStatus = currentStatus;

      // Se o tópico estiver "nao_estudado", avançar para "estudando"
      if (currentStatus === 'nao_estudado') {
        newStatus = 'estudando';
      }

      // Dentro do handleSalvar, após criar o registro (onde está a chamada do serviço)
      if (userId && newStatus !== currentStatus) {
        try {
          console.log(`🔄 Atualizando status do tópico para "${newStatus}"...`);
          await updateTopicStatusAndRevisions(selectedTopicId, newStatus, userId);
          await loadContentData();
          console.log('✅ Status do tópico e revisões atualizados.');
        } catch (error) {
          // Se falhar, apenas loga o erro, mas não impede o salvamento do estudo
          console.error('⚠️ Erro ao atualizar tópico, mas o registro de estudo foi salvo:', error);
        }
      }

      setSalvo(true);
      setTimeout(() => {
        setSalvo(false);
        setModo("calendario");
      }, 1500);
    } catch (error) {
      console.error('❌ Erro ao salvar estudo:', error);
      alert('Erro ao salvar registro. Verifique o console para mais detalhes.');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================
  // FUNÇÃO PARA EXCLUIR REGISTRO
  // ============================================================
  const handleDeleteRecord = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      deleteRecord(id);
    }
  };

  // ============================================================
  // RENDER: CALENDÁRIO
  // ============================================================
  if (modo === "calendario") {
    const nomeMes = new Date(anoVisivel, mesVisivel).toLocaleString('pt-BR', { month: 'long' });
    const tituloMes = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} ${anoVisivel}`;
    const isDiaSelecionadoHoje = diaSelecionado === diaAtual && anoVisivel === anoAtual && mesVisivel === mesAtual;

    return (
      <AppShell breadcrumb="Calendário" title="Agenda de estudos">
        <div id="calendario-header">
        {salvo && (
          <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
            ✅ Estudo registrado com sucesso!
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rf-card p-5 lg:col-span-2">
            <header className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg font-semibold">{tituloMes}</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={mesAnterior}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-white/5"
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={mesSeguinte}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-white/5"
                    aria-label="Próximo mês"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={irParaHoje}
                    className="ml-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-foreground/60 hover:bg-white/5"
                  >
                    Hoje
                  </button>
                </div>
              </div>
              <button
                onClick={() => setModo("registrar")}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Registrar estudo
              </button>
            </header>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"].map((d) => (
                <div key={d} className="bg-surface px-2 py-2 text-center text-[10px] font-medium tracking-widest text-foreground/40">
                  {d}
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={i} className="bg-surface/40 aspect-square sm:aspect-auto sm:h-20" />;
                const e = daysWithStudy[d];
                const isHoje = d === diaAtual && anoVisivel === anoAtual && mesVisivel === mesAtual;
                const isSelecionado = d === diaSelecionado;

                return (
                  <button
                    key={i}
                    onClick={() => setDiaSelecionado(d)}
                    className={[
                      "relative bg-surface p-2 transition-all aspect-square sm:aspect-auto sm:h-20 w-full text-left",
                      isHoje ? "ring-1 ring-inset ring-primary" : "",
                      isSelecionado ? "bg-primary/10 ring-1 ring-inset ring-primary" : "hover:bg-surface-2",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-xs font-medium tabular-nums",
                        isHoje ? "text-primary" : "text-foreground/80",
                      ].join(" ")}
                    >
                      {d}
                    </span>
                    {e && (
                      <div className="absolute bottom-1.5 left-2 flex gap-1">
                        {e.teorico && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        {e.pratico && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
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
              <span className="ml-auto">
                {diaSelecionado !== null ? (
                  <span className="text-primary">
                    Dia {diaSelecionado} selecionado
                  </span>
                ) : (
                  <span className="text-foreground/40">Clique em um dia para ver os registros</span>
                )}
              </span>
            </div>
          </section>

          {/* ============================================================
              SIDEBAR – Registros e revisões do dia selecionado
          ============================================================ */}
          <aside className="space-y-4">
            <div className="rf-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold">
                  {diaSelecionado !== null ? dataFormatada : "Selecione um dia"}
                </h3>
                {diaSelecionado !== null && (
                  <button
                    onClick={() => setDiaSelecionado(null)}
                    className="text-foreground/40 hover:text-foreground transition-colors"
                    aria-label="Limpar seleção"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {diaSelecionado !== null ? (
                <>
                  {/* ========== REGISTROS DE ESTUDO ========== */}
                  <div className="mb-4">
                    <p className="text-xs text-foreground/45 mb-2">
                      📚 {registrosDoDia.length} registro{registrosDoDia.length !== 1 ? 's' : ''} de estudo
                      {isDiaSelecionadoHoje && ' (hoje)'}
                    </p>
                    <ul className="space-y-3">
                      {registrosDoDia.length > 0 ? (
                        registrosDoDia.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center gap-3 rounded-lg border border-border/60 p-3 rf-card-hover group"
                          >
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
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
                              className="text-foreground/30 hover:text-red-400 transition-colors md:opacity-0 md:group-hover:opacity-100"
                              aria-label="Excluir registro"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="text-center text-sm text-foreground/40 py-2">
                          Nenhum estudo registrado neste dia.
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* ========== REVISÕES PROGRAMADAS ========== */}
                  {revisoesDoDia.length > 0 && (
                    <div className="border-t border-border/60 pt-4 mt-2">
                      <p className="text-xs text-foreground/45 mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" />
                        {revisoesDoDia.length} revisão{revisoesDoDia.length !== 1 ? 'ões' : ''} programada{revisoesDoDia.length !== 1 ? 's' : ''}
                      </p>
                      <ul className="space-y-3">
                        {revisoesDoDia.map((rev) => {
                          const levels = ['1 dia', '7 dias', '15 dias', '30 dias', '60 dias'];
                          const label = levels[rev.review_level - 1] || `${rev.review_level} dias`;
                          return (
                            <li
                              key={rev.id}
                              className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
                            >
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/20 text-[10px] font-semibold text-primary">
                                {rev.review_level}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{rev.topicName}</div>
                                <div className="truncate text-[11px] text-foreground/45">
                                  {rev.discipline} · {label}
                                </div>
                              </div>
                              {/* 🔥 Botão Concluir com proteção contra múltiplos cliques */}
                              <button
                                onClick={() => handleConcluirRevisao(rev.id)}
                                disabled={concluindoRevisaoId === rev.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary/20 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {concluindoRevisaoId === rev.id ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Concluindo...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Concluir
                                  </>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
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
      </div>     {/* <-- FECHA O id="calendario-header" */}
    </AppShell>
  );
}

  // ============================================================
  // RENDER: REGISTRAR ESTUDO (COM SELECTS DE DISCIPLINA E TÓPICO)
  // ============================================================
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
                formData={formData}
                setFormData={setFormData}
                formMaterial={formMaterial}
                setFormMaterial={setFormMaterial}
                disciplinas={disciplinas}
                topicos={topicos}
                selectedDisciplineId={selectedDisciplineId}
                setSelectedDisciplineId={setSelectedDisciplineId}
                selectedTopicId={selectedTopicId}
                setSelectedTopicId={setSelectedTopicId}
              />
            ) : (
              <PraticoForm
                formData={formData}
                setFormData={setFormData}
                formQuestions={formQuestions}
                setFormQuestions={setFormQuestions}
                formCorrect={formCorrect}
                setFormCorrect={setFormCorrect}
                formWrong={setFormWrong}
                setFormWrong={setFormWrong}
                disciplinas={disciplinas}
                topicos={topicos}
                selectedDisciplineId={selectedDisciplineId}
                setSelectedDisciplineId={setSelectedDisciplineId}
                selectedTopicId={selectedTopicId}
                setSelectedTopicId={setSelectedTopicId}
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
            className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/65 hover:bg-white/5"
            disabled={isSaving}
          >
            Cancelar
          </button>
          {/* 🔥 Botão Salvar com proteção contra múltiplos cliques */}
          <button
            onClick={handleSalvar}
            disabled={isSaving}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar estudo'
            )}
          </button>
        </footer>
      </AppShell>
    );
  }

  return null;
}

// ============================================================
// COMPONENTES AUXILIARES (MANTIDOS IGUAIS)
// ============================================================

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/40 p-3">
      <div className="font-display text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-foreground/40">{label}</div>
    </div>
  );
}

function TipoCard({ icon, label, desc, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  active?: boolean;
  onClick?: () => void;
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
  formData,
  setFormData,
  formMaterial,
  setFormMaterial,
  disciplinas,
  topicos,
  selectedDisciplineId,
  setSelectedDisciplineId,
  selectedTopicId,
  setSelectedTopicId
}: {
  formData: any;
  setFormData: (data: any) => void;
  formMaterial: string;
  setFormMaterial: (v: string) => void;
  disciplinas: { id: string; name: string }[];
  topicos: { id: string; name: string; discipline_id: string; status: string }[];
  selectedDisciplineId: string;
  setSelectedDisciplineId: (id: string) => void;
  selectedTopicId: string;
  setSelectedTopicId: (id: string) => void;
}) {
  return (
    <div className="rf-card p-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-foreground/40">Detalhes</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data">
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Duração (min)">
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Disciplina">
          <select
            value={selectedDisciplineId}
            onChange={(e) => {
              setSelectedDisciplineId(e.target.value);
              setSelectedTopicId('');
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Selecione uma disciplina</option>
            {disciplinas.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
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
            {topicos
              .filter(t => t.discipline_id === selectedDisciplineId)
              .map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Material consultado">
          <input
            type="text"
            value={formMaterial}
            onChange={(e) => setFormMaterial(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Observações">
          <textarea
            rows={3}
            value={formData.observations}
            onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
            placeholder="Resumo, dúvidas que ficaram, próximos passos…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
      </div>
    </div>
  );
}

function PraticoForm({
  formData,
  setFormData,
  formQuestions,
  setFormQuestions,
  formCorrect,
  setFormCorrect,
  formWrong,
  setFormWrong,
  disciplinas,
  topicos,
  selectedDisciplineId,
  setSelectedDisciplineId,
  selectedTopicId,
  setSelectedTopicId
}: {
  formData: any;
  setFormData: (data: any) => void;
  formQuestions: number;
  setFormQuestions: (v: number) => void;
  formCorrect: number;
  setFormCorrect: (v: number) => void;
  formWrong: number;
  setFormWrong: (v: number) => void;
  disciplinas: { id: string; name: string }[];
  topicos: { id: string; name: string; discipline_id: string; status: string }[];
  selectedDisciplineId: string;
  setSelectedDisciplineId: (id: string) => void;
  selectedTopicId: string;
  setSelectedTopicId: (id: string) => void;
}) {
  return (
    <div className="rf-card p-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-foreground/40">Detalhes da prática</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data">
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Duração (min)">
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Disciplina">
          <select
            value={selectedDisciplineId}
            onChange={(e) => {
              setSelectedDisciplineId(e.target.value);
              setSelectedTopicId('');
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Selecione uma disciplina</option>
            {disciplinas.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
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
            {topicos
              .filter(t => t.discipline_id === selectedDisciplineId)
              .map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Questões feitas">
          <input
            type="number"
            value={formQuestions}
            onChange={(e) => setFormQuestions(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Acertos">
          <input
            type="number"
            value={formCorrect}
            onChange={(e) => setFormCorrect(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Erros">
          <input
            type="number"
            value={formWrong}
            onChange={(e) => setFormWrong(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Observações">
          <textarea
            rows={3}
            value={formData.observations}
            onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
            placeholder="Tópicos errados, padrões de erro, revisões agendadas…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
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