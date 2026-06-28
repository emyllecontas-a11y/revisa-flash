import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { 
  Plus, Search, ChevronRight, ChevronLeft, FileText, Upload, 
  Layers, Pencil, Trash2, X, BookOpen, Sparkles, ImageIcon,
  FileSpreadsheet, Music, Calendar, Clock, CheckCircle2, Circle,
  Loader2
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { uid, gerenciarRevisao } from "@/utils/helpers";
import { getDb } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile, listFilesByTopic, deleteFile, FileRecord } from "@/services/fileService";

// ============================================================
// ROTA
// ============================================================
export const Route = createFileRoute("/conteudo")({
  component: ConteudoPage,
  ssr: false,
});

// ============================================================
// TIPOS
// ============================================================
interface Disciplina {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

interface Topico {
  id: string;
  discipline_id: string;
  name: string;
  status: string;
  planned_date: string | null;
  created_at: string;
}

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
function ConteudoPage() {
  const [modo, setModo] = useState<"disciplinas" | "disciplina-detalhe" | "topico-detalhe">("disciplinas");
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "em-andamento" | "concluido" | "iniciar">("todas");
  const [busca, setBusca] = useState("");

  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [filesMap, setFilesMap] = useState<Record<string, FileRecord[]>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddTopicModalOpen, setIsAddTopicModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [discNome, setDiscNome] = useState("");
  const [discDesc, setDiscDesc] = useState("");

  const [topicoNome, setTopicoNome] = useState("");
  const [topicoDesc, setTopicoDesc] = useState("");
  const [topicoStatus, setTopicoStatus] = useState<"nao_estudado" | "estudando" | "revisado" | "dominado">("nao_estudado");

  // Upload states
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  // ============================================================
  // USER ID
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

  // ============================================================
  // CARREGAR DADOS
  // ============================================================
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();
      
      const disciplinesResult = await db.disciplines.find({
        selector: { user_id: userId, deletedAt: { $eq: null } }
      }).exec();
      setDisciplinas(disciplinesResult.map((doc: any) => doc.toJSON()));

      const topicsResult = await db.topics.find({
        selector: { user_id: userId, deletedAt: { $eq: null } }
      }).exec();
      setTopicos(topicsResult.map((doc: any) => doc.toJSON()));

      const revisoesResult = await db.revisoes.find({
        selector: { user_id: userId }
      }).exec();
      setRevisoes(revisoesResult.map((doc: any) => doc.toJSON()));

    } catch (error) {
      console.error('Erro ao carregar dados do RxDB:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId, loadData]);

  // ============================================================
  // FUNÇÕES AUXILIARES
  // ============================================================
  const getDisciplinaById = useCallback((id: string) => {
    return disciplinas.find(d => d.id === id);
  }, [disciplinas]);

  const getTopicosPorDisciplina = useCallback((disciplineId: string) => {
    return topicos.filter(t => t.discipline_id === disciplineId);
  }, [topicos]);

  const getTopicoById = useCallback((id: string) => {
    return topicos.find(t => t.id === id);
  }, [topicos]);

  const getRevisoesPorTopico = useCallback((topicoId: string) => {
    return revisoes.filter(r => r.topico_id === topicoId && !r.completedAt);
  }, [revisoes]);

  const getStatusCounts = useCallback((disciplineId: string) => {
    const topicosDaDisciplina = getTopicosPorDisciplina(disciplineId);
    const total = topicosDaDisciplina.length;
    const concluidos = topicosDaDisciplina.filter(t => t.status === "dominado" || t.status === "revisado").length;
    const emAndamento = topicosDaDisciplina.filter(t => t.status === "estudando").length;
    const naoIniciados = topicosDaDisciplina.filter(t => t.status === "nao_estudado").length;
    return { total, concluidos, emAndamento, naoIniciados };
  }, [getTopicosPorDisciplina]);

  const loadFilesForTopic = useCallback(async (topicId: string) => {
    if (!userId) return;
    try {
      const files = await listFilesByTopic(topicId, userId);
      setFilesMap(prev => ({ ...prev, [topicId]: files }));
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
    }
  }, [userId]);

  // ============================================================
  // UPLOAD E REMOÇÃO DE ARQUIVOS
  // ============================================================
  const handleUploadFile = useCallback(async (topicId: string, file: File) => {
    if (!userId) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const db = await getDb();
      const topicDoc = await db.topics.findOne({ selector: { id: topicId } }).exec();
      if (!topicDoc) throw new Error('Tópico não encontrado');
      const topicData = topicDoc.toJSON();
      const disciplina = getDisciplinaById(topicData.discipline_id);
      const disciplinaNome = disciplina?.name || 'Disciplina';

      // Simular progresso (opcional)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const fileRecord = await uploadFile(file, topicId, disciplinaNome, userId);
      clearInterval(progressInterval);
      setUploadProgress(100);

      setFilesMap(prev => ({
        ...prev,
        [topicId]: [fileRecord, ...(prev[topicId] || [])],
      }));
    } catch (error: any) {
      console.error('❌ Erro no upload:', error);
      setUploadError(error.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, [userId, getDisciplinaById]);

  const handleRemoveFile = useCallback(async (fileId: string, filePath: string, topicId: string) => {
    if (!confirm('Tem certeza que deseja remover este arquivo?')) return;
    setIsDeleting(true);
    try {
      await deleteFile(fileId, filePath);
      setFilesMap(prev => ({
        ...prev,
        [topicId]: (prev[topicId] || []).filter(f => f.id !== fileId),
      }));
    } catch (error) {
      console.error('❌ Erro ao remover arquivo:', error);
      alert('Erro ao remover arquivo.');
    } finally {
      setIsDeleting(false);
    }
  }, []);

  // ============================================================
  // CRUD (disciplinas, tópicos, revisões)
  // ============================================================
  const syncRevisoes = useCallback(async (revisoesData: Revisao[]) => {
    if (!userId) return;
    try {
      const mapped = revisoesData.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        topico_id: r.topico_id,
        topicName: r.topicName,
        discipline: r.discipline,
        review_level: r.review_level,
        nextReviewDate: r.nextReviewDate,
        lastStudyDate: r.lastStudyDate,
        completedAt: r.completedAt || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
      const { error } = await supabase
        .from('revisoes')
        .upsert(mapped, { onConflict: 'id' });
      if (error) console.error('❌ Erro ao sincronizar revisões:', error);
      else console.log('✅ Revisões sincronizadas com Supabase');
    } catch (error) {
      console.error('❌ Erro ao sincronizar revisões:', error);
    }
  }, [userId]);

  const gerenciarRevisoesTopico = useCallback(async (
    topicoId: string,
    topicoNome: string,
    disciplinaNome: string,
    novoStatus: string
  ) => {
    if (!userId) return;
    try {
      const db = await getDb();
      
      const existingDocs = await db.revisoes.find({
        selector: { user_id: userId, topico_id: topicoId }
      }).exec();
      const existingRevisoes = existingDocs.map((doc: any) => doc.toJSON());

      const novasRevisoes = gerenciarRevisao(
        topicoId,
        topicoNome,
        disciplinaNome,
        novoStatus,
        existingRevisoes
      );

      const novosIds = novasRevisoes.map(r => r.id);
      for (const doc of existingDocs) {
        if (!novosIds.includes(doc.id)) {
          await doc.remove();
        }
      }

      const revisoesParaSalvar: Revisao[] = [];
      for (const rev of novasRevisoes) {
        const topicoIdFinal = rev.topicoId || topicoId;
        const topicNameFinal = rev.topicoNome || topicoNome;
        const disciplineFinal = rev.disciplina || disciplinaNome;
        const reviewLevelFinal = rev.reviewLevel || 1;
        const nextReviewDateFinal = rev.nextReviewDate || new Date(Date.now() + 86400000).toISOString();
        const lastStudyDateFinal = rev.lastStudyDate || new Date().toISOString();

        const existingDoc = existingDocs.find(d => d.id === rev.id);
        if (existingDoc) {
          await existingDoc.incrementalPatch({
            review_level: reviewLevelFinal,
            nextReviewDate: nextReviewDateFinal,
            lastStudyDate: lastStudyDateFinal,
            completedAt: rev.completedAt || null,
            updatedAt: new Date().toISOString()
          });
        } else {
          await db.revisoes.insert({
            id: rev.id,
            user_id: userId,
            topico_id: topicoIdFinal,
            topicName: topicNameFinal,
            discipline: disciplineFinal,
            review_level: reviewLevelFinal,
            nextReviewDate: nextReviewDateFinal,
            lastStudyDate: lastStudyDateFinal,
            completedAt: rev.completedAt || null,
            createdAt: rev.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        revisoesParaSalvar.push({
          id: rev.id,
          user_id: userId,
          topico_id: topicoIdFinal,
          topicName: topicNameFinal,
          discipline: disciplineFinal,
          review_level: reviewLevelFinal,
          nextReviewDate: nextReviewDateFinal,
          lastStudyDate: lastStudyDateFinal,
          completedAt: rev.completedAt || null,
          createdAt: rev.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      await loadData();
      await syncRevisoes(revisoesParaSalvar);
      console.log('✅ Revisões atualizadas com sucesso');
    } catch (error) {
      console.error('❌ Erro ao gerenciar revisões:', error);
      throw error;
    }
  }, [userId, loadData, syncRevisoes]);

  const handleCreateDiscipline = useCallback(async () => {
    if (!discNome.trim()) {
      setErrorMessage("Digite um nome para a disciplina");
      return;
    }
    if (!userId) {
      setErrorMessage("Usuário não autenticado");
      return;
    }
    try {
      setIsSaving(true);
      const now = new Date().toISOString();
      const id = uid();
      const db = await getDb();
      await db.disciplines.insert({
        id,
        name: discNome.trim(),
        user_id: userId,
        createdAt: now
      });
      setDiscNome("");
      setDiscDesc("");
      setIsModalOpen(false);
      setErrorMessage("");
      await loadData();
    } catch (error: any) {
      console.error("❌ Erro ao criar disciplina:", error);
      setErrorMessage("Erro ao criar disciplina: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [discNome, discDesc, userId, loadData]);

  const handleCreateTopic = useCallback(async () => {
    if (!selectedDisciplineId) {
      setErrorMessage("Selecione uma disciplina primeiro");
      return;
    }
    if (!topicoNome.trim()) {
      setErrorMessage("Digite um nome para o tópico");
      return;
    }
    if (!userId) {
      setErrorMessage("Usuário não autenticado");
      return;
    }
    try {
      setIsSaving(true);
      const now = new Date().toISOString();
      const id = uid();
      const db = await getDb();
      await db.topics.insert({
        id,
        discipline_id: selectedDisciplineId,
        name: topicoNome.trim(),
        status: topicoStatus,
        planned_date: null,
        createdAt: now,
        user_id: userId
      });
      setTopicoNome("");
      setTopicoDesc("");
      setTopicoStatus("nao_estudado");
      setIsAddTopicModalOpen(false);
      setErrorMessage("");
      await loadData();
    } catch (error: any) {
      console.error("❌ Erro ao criar tópico:", error);
      setErrorMessage("Erro ao criar tópico: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [selectedDisciplineId, topicoNome, topicoDesc, topicoStatus, userId, loadData]);

  const handleDeleteDiscipline = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta disciplina e todos os seus tópicos?")) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      const disciplineDoc = await db.disciplines.findOne({ selector: { id } }).exec();
      if (disciplineDoc) {
        await disciplineDoc.incrementalPatch({ deletedAt: now });
      }

      const topics = await db.topics.find({ selector: { discipline_id: id } }).exec();
      const topicIds = topics.map(t => t.id);

      for (const t of topics) {
        await t.incrementalPatch({ deletedAt: now });
        const revisoesTopico = await db.revisoes.find({ selector: { topico_id: t.id } }).exec();
        const revisoesIds = revisoesTopico.map(r => r.id);
        for (const r of revisoesTopico) {
          await r.remove();
        }
        if (revisoesIds.length > 0) {
          await supabase.from('revisoes').delete().in('id', revisoesIds);
        }
      }

      await supabase.from('disciplines').update({ deletedAt: now }).eq('id', id);
      if (topicIds.length > 0) {
        await supabase.from('topics').update({ deletedAt: now }).in('id', topicIds);
      }

      if (selectedDisciplineId === id) {
        setSelectedDisciplineId(null);
        setModo("disciplinas");
      }

      await loadData();
      setErrorMessage("✅ Disciplina excluída com sucesso!");
      setTimeout(() => setErrorMessage(""), 3000);

    } catch (error: any) {
      console.error("❌ Erro ao deletar disciplina:", error);
      setErrorMessage("Erro ao deletar disciplina: " + (error.message || "Erro desconhecido"));
    }
  }, [selectedDisciplineId, loadData]);

  const handleDeleteTopic = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este tópico?")) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      const doc = await db.topics.findOne({ selector: { id } }).exec();
      if (doc) {
        await doc.incrementalPatch({ deletedAt: now });

        const revisoesTopico = await db.revisoes.find({ selector: { topico_id: id } }).exec();
        const revisoesIds = revisoesTopico.map(r => r.id);
        for (const r of revisoesTopico) {
          await r.remove();
        }
        if (revisoesIds.length > 0) {
          await supabase.from('revisoes').delete().in('id', revisoesIds);
        }

        await supabase.from('topics').update({ deletedAt: now }).eq('id', id);

        if (selectedTopicId === id) {
          setSelectedTopicId(null);
          setModo("disciplina-detalhe");
        }
        await loadData();
        setErrorMessage("✅ Tópico excluído com sucesso!");
        setTimeout(() => setErrorMessage(""), 3000);
      }
    } catch (error: any) {
      console.error("❌ Erro ao deletar tópico:", error);
      setErrorMessage("Erro ao deletar tópico: " + (error.message || "Erro desconhecido"));
    }
  }, [selectedTopicId, loadData]);

  const handleUpdateTopicStatus = useCallback(async (id: string, newStatus: string) => {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const doc = await db.topics.findOne({ selector: { id } }).exec();
      if (doc) {
        const topicoData = doc.toJSON();
        const disciplina = getDisciplinaById(topicoData.discipline_id);

        await doc.incrementalPatch({
          status: newStatus,
          updatedAt: now
        });

        const { error } = await supabase
          .from('topics')
          .update({ status: newStatus, updatedAt: now })
          .eq('id', id);

        if (error) {
          console.error('❌ Erro ao enviar atualização para Supabase:', error);
          await doc.incrementalPatch({ status: doc.get('status') });
          throw error;
        }

        await gerenciarRevisoesTopico(
          id,
          topicoData.name,
          disciplina?.name || 'Disciplina',
          newStatus
        );

        await loadData();
        console.log('✅ Status do tópico atualizado com sucesso (local e Supabase)');
      }
    } catch (error: any) {
      console.error("❌ Erro ao atualizar status do tópico:", error);
      setErrorMessage("Erro ao atualizar status: " + (error.message || "Erro desconhecido"));
    }
  }, [getDisciplinaById, gerenciarRevisoesTopico, loadData]);

  // ============================================================
  // NAVEGAÇÃO
  // ============================================================
  const abrirDisciplina = useCallback((id: string) => {
    setSelectedDisciplineId(id);
    setModo("disciplina-detalhe");
    setSelectedTopicId(null);
  }, []);

  const abrirTopico = useCallback((id: string) => {
    setSelectedTopicId(id);
    setModo("topico-detalhe");
    // Carregar arquivos do tópico
    if (userId) {
      loadFilesForTopic(id);
    }
  }, [userId, loadFilesForTopic]);

  const voltarParaDisciplinas = useCallback(() => {
    setModo("disciplinas");
    setSelectedDisciplineId(null);
    setSelectedTopicId(null);
  }, []);

  const voltarParaDisciplina = useCallback(() => {
    setModo("disciplina-detalhe");
    setSelectedTopicId(null);
  }, []);

  // Carregar arquivos quando o tópico for selecionado novamente
  useEffect(() => {
    if (selectedTopicId && userId && modo === "topico-detalhe") {
      loadFilesForTopic(selectedTopicId);
    }
  }, [selectedTopicId, userId, modo, loadFilesForTopic]);

  // ============================================================
  // FILTROS
  // ============================================================
  const disciplinasFiltradas = useMemo(() => {
    let lista = [...disciplinas];
    if (filtro === "em-andamento") {
      lista = lista.filter(d => {
        const counts = getStatusCounts(d.id);
        return counts.emAndamento > 0 && counts.concluidos < counts.total;
      });
    } else if (filtro === "concluido") {
      lista = lista.filter(d => {
        const counts = getStatusCounts(d.id);
        return counts.total > 0 && counts.concluidos === counts.total;
      });
    } else if (filtro === "iniciar") {
      lista = lista.filter(d => {
        const counts = getStatusCounts(d.id);
        return counts.total === 0 || counts.naoIniciados === counts.total;
      });
    }
    if (busca.trim()) {
      const term = busca.toLowerCase().trim();
      lista = lista.filter(d => d.name.toLowerCase().includes(term));
    }
    return lista;
  }, [disciplinas, filtro, busca, getStatusCounts]);

  // ============================================================
  // FUNÇÕES AUXILIARES DE ÍCONES
  // ============================================================
  const getIconByType = (tipo: string) => {
    if (tipo.startsWith('image/')) return ImageIcon;
    if (tipo.includes('spreadsheet') || tipo.includes('sheet') || tipo.includes('xls')) return FileSpreadsheet;
    if (tipo.includes('audio') || tipo.includes('mp3') || tipo.includes('wav')) return Music;
    return FileText;
  };

  const getIconCor = (tipo: string) => {
    if (tipo.startsWith('image/')) return 'text-primary bg-primary/10';
    if (tipo.includes('spreadsheet') || tipo.includes('sheet') || tipo.includes('xls')) return 'text-warning bg-warning/15';
    if (tipo.includes('audio') || tipo.includes('mp3') || tipo.includes('wav')) return 'text-accent bg-accent/10';
    return 'text-accent bg-accent/10';
  };

  // ============================================================
  // RENDER: LISTA DE DISCIPLINAS
  // ============================================================
  if (modo === "disciplinas") {
    return (
      <>
        <AppShell breadcrumb="Conteúdo" title="Disciplinas e materiais">
          {errorMessage && (
            <div className={`mb-4 rounded-xl border p-3 text-sm ${
              errorMessage.includes("✅") ? "border-green-500/20 bg-green-500/20 text-green-400" : "border-red-500/20 bg-red-500/20 text-red-400"
            }`}>
              {errorMessage}
            </div>
          )}

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {([
                ["todas", "Todas"],
                ["em-andamento", "Em andamento"],
                ["concluido", "Concluídas"],
                ["iniciar", "Não iniciadas"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFiltro(k)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    filtro === k
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface text-foreground/65 hover:bg-surface-2",
                  ].join(" ")}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsModalOpen(true); setErrorMessage(""); }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Nova disciplina
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {disciplinasFiltradas.length > 0 ? (
              disciplinasFiltradas.map((d) => {
                const counts = getStatusCounts(d.id);
                const progresso = counts.total > 0 ? Math.round((counts.concluidos / counts.total) * 100) : 0;
                const status = counts.total === 0 || counts.naoIniciados === counts.total ? "iniciar" : counts.concluidos === counts.total ? "concluido" : "em-andamento";
                return (
                  <button
                    key={d.id}
                    onClick={() => abrirDisciplina(d.id)}
                    className="rf-card rf-card-hover group flex items-center gap-4 p-4 sm:p-5 w-full text-left"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-base font-semibold text-primary">
                      {d.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="truncate text-sm font-semibold sm:text-base">{d.name}</h3>
                        <StatusBadge status={status} />
                      </div>
                      <div className="mt-0.5 text-xs text-foreground/45">{counts.total} tópicos</div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={[
                              "h-full rounded-full transition-all",
                              progresso === 100 ? "bg-primary" : progresso === 0 ? "bg-foreground/15" : "bg-gradient-to-r from-primary to-primary/60",
                            ].join(" ")}
                            style={{ width: `${progresso}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums text-foreground/70 w-10 text-right">{progresso}%</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                );
              })
            ) : (
              <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
                <p className="text-sm text-foreground/40">
                  {busca ? "Nenhuma disciplina encontrada para esta busca." : "Nenhuma disciplina criada. Clique em 'Nova disciplina' para começar."}
                </p>
              </div>
            )}
          </div>
        </AppShell>

        {/* MODAL: CRIAR DISCIPLINA */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Criar nova disciplina</h3>
                <button
                  onClick={() => { setIsModalOpen(false); setDiscNome(""); setDiscDesc(""); setErrorMessage(""); }}
                  className="text-foreground/50 hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground/70">Nome da disciplina *</label>
                  <input
                    type="text"
                    placeholder="Ex: Patologia Oral"
                    value={discNome}
                    onChange={(e) => setDiscNome(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground/70">Descrição</label>
                  <textarea
                    rows={3}
                    placeholder="Descreva o conteúdo da disciplina"
                    value={discDesc}
                    onChange={(e) => setDiscDesc(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1 resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setIsModalOpen(false); setDiscNome(""); setDiscDesc(""); setErrorMessage(""); }}
                    className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                    disabled={isSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateDiscipline}
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? "Criando..." : "Criar disciplina"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ============================================================
  // RENDER: DETALHES DA DISCIPLINA
  // ============================================================
  if (modo === "disciplina-detalhe" && selectedDisciplineId) {
    const disciplina = getDisciplinaById(selectedDisciplineId);
    if (!disciplina) {
      setModo("disciplinas");
      return null;
    }

    const topicosDaDisciplina = getTopicosPorDisciplina(selectedDisciplineId);
    const counts = getStatusCounts(selectedDisciplineId);
    const progresso = counts.total > 0 ? Math.round((counts.concluidos / counts.total) * 100) : 0;

    return (
      <>
        <AppShell breadcrumb={`Conteúdo · ${disciplina.name}`}>
          <button
            onClick={voltarParaDisciplinas}
            className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar para Disciplinas
          </button>

          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-2xl">🔬</div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">Disciplina</span>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{disciplina.name}</h1>
                <p className="mt-1 max-w-xl text-sm text-foreground/55">{discDesc || "Sem descrição"}</p>
              </div>
            </div>
            <div className="flex gap-2 self-start sm:self-auto">
              <button
                onClick={() => { setIsAddTopicModalOpen(true); setErrorMessage(""); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Novo tópico
              </button>
              <button
                onClick={() => handleDeleteDiscipline(selectedDisciplineId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            </div>
          </header>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini icon={<Layers className="h-4 w-4" />} l="Tópicos" v={counts.total} />
            <Mini l="Concluídos" v={counts.concluidos} />
            <Mini l="Em andamento" v={counts.emAndamento} />
            <Mini l="Progresso" v={`${progresso}%`} tone="accent" />
          </div>

          <h2 className="mb-3 font-display text-base font-semibold">Tópicos</h2>
          <div className="grid gap-3">
            {topicosDaDisciplina.length > 0 ? (
              topicosDaDisciplina.map((t) => {
                const statusMap: Record<string, { label: string; className: string }> = {
                  "nao_estudado": { label: "Não iniciado", className: "bg-accent/10 text-accent" },
                  "estudando": { label: "Estudando", className: "bg-primary/10 text-primary" },
                  "revisado": { label: "Revisado", className: "bg-primary/15 text-primary" },
                  "dominado": { label: "Dominado", className: "bg-green-500/10 text-green-400" },
                };
                const status = statusMap[t.status] || statusMap["nao_estudado"];
                return (
                  <button
                    key={t.id}
                    onClick={() => abrirTopico(t.id)}
                    className="rf-card rf-card-hover group flex items-center gap-4 p-5 w-full text-left"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background/60 font-display text-sm font-semibold text-foreground/70 tabular-nums">
                      {topicosDaDisciplina.indexOf(t) + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold sm:text-base">{t.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-foreground/45">
                        {t.status === "dominado" ? "✅ Concluído" : "📚 Em estudo"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                );
              })
            ) : (
              <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-white/10">
                <p className="text-sm text-foreground/40">Nenhum tópico criado. Clique em "Novo tópico" para começar.</p>
              </div>
            )}
          </div>
        </AppShell>

        {/* MODAL: CRIAR TÓPICO */}
        {isAddTopicModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Criar novo tópico</h3>
                <button
                  onClick={() => { setIsAddTopicModalOpen(false); setTopicoNome(""); setTopicoDesc(""); setTopicoStatus("nao_estudado"); setErrorMessage(""); }}
                  className="text-foreground/50 hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground/70">Nome do tópico *</label>
                  <input
                    type="text"
                    placeholder="Ex: Lesões fundamentais"
                    value={topicoNome}
                    onChange={(e) => setTopicoNome(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground/70">Descrição</label>
                  <textarea
                    rows={3}
                    placeholder="Descreva o conteúdo do tópico"
                    value={topicoDesc}
                    onChange={(e) => setTopicoDesc(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1 resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground/70">Status inicial</label>
                  <select
                    value={topicoStatus}
                    onChange={(e) => setTopicoStatus(e.target.value as any)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
                  >
                    <option value="nao_estudado">Não iniciado</option>
                    <option value="estudando">Estudando</option>
                    <option value="revisado">Revisado</option>
                    <option value="dominado">Dominado</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setIsAddTopicModalOpen(false); setTopicoNome(""); setTopicoDesc(""); setTopicoStatus("nao_estudado"); setErrorMessage(""); }}
                    className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                    disabled={isSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateTopic}
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? "Criando..." : "Criar tópico"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ============================================================
  // RENDER: DETALHES DO TÓPICO (COM ANEXOS)
  // ============================================================
  if (modo === "topico-detalhe" && selectedTopicId) {
    const topico = getTopicoById(selectedTopicId);
    if (!topico) {
      setModo("disciplina-detalhe");
      return null;
    }

    const disciplina = getDisciplinaById(topico.discipline_id);
    const statusMap: Record<string, { label: string; className: string }> = {
      "nao_estudado": { label: "Não iniciado", className: "bg-accent/10 text-accent" },
      "estudando": { label: "Estudando", className: "bg-primary/10 text-primary" },
      "revisado": { label: "Revisado", className: "bg-primary/15 text-primary" },
      "dominado": { label: "Dominado", className: "bg-green-500/10 text-green-400" },
    };
    const status = statusMap[topico.status] || statusMap["nao_estudado"];

    const revisoesTopico = getRevisoesPorTopico(topico.id);
    const proximaRevisao = revisoesTopico.length > 0 
      ? revisoesTopico.sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime())[0]
      : null;

    const currentFiles = filesMap[topico.id] || [];

    const statusOptions = [
      { value: "nao_estudado", label: "Não iniciado" },
      { value: "estudando", label: "Estudando" },
      { value: "revisado", label: "Revisado" },
      { value: "dominado", label: "Dominado" },
    ];

    return (
      <AppShell breadcrumb={`Conteúdo · ${disciplina?.name || "Tópico"}`}>
        <button
          onClick={voltarParaDisciplina}
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar à disciplina
        </button>

        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 font-display text-base font-semibold text-primary tabular-nums">
              {topicos.filter(t => t.discipline_id === topico.discipline_id).indexOf(topico) + 1 || "?"}
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">{disciplina?.name || "Disciplina"}</span>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{topico.name}</h1>
              <p className="mt-1 max-w-xl text-sm text-foreground/55">{topicoDesc || "Sem descrição"}</p>
            </div>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <div className="relative">
              <select
                value={topico.status}
                onChange={(e) => handleUpdateTopicStatus(topico.id, e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground/70 outline-none focus:border-primary"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => handleDeleteTopic(selectedTopicId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini icon={<FileText className="h-4 w-4" />} l="Status" v={status.label} />
          <Mini icon={<Sparkles className="h-4 w-4" />} l="Progresso" v={
            topico.status === "dominado" ? "100%" : 
            topico.status === "revisado" ? "75%" : 
            topico.status === "estudando" ? "50%" : "0%"
          } tone={topico.status === "dominado" ? "accent" : undefined} />
          <Mini icon={<BookOpen className="h-4 w-4" />} l="Disciplina" v={disciplina?.name || "—"} />
          <Mini icon={<Calendar className="h-4 w-4" />} l="Próxima revisão" v={
            proximaRevisao ? new Date(proximaRevisao.nextReviewDate).toLocaleDateString('pt-BR') : "—"
          } />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
            {/* MATERIAIS COM UPLOAD REAL */}
            <div className="rf-card p-6">
              <header className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-widest text-foreground/40">Materiais</h3>
                  <p className="mt-1 text-xs text-foreground/55">PDFs, imagens, planilhas, áudios deste tópico.</p>
                </div>
                <div>
                  <input
                    type="file"
                    id={`file-upload-${topico.id}`}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadFile(topico.id, file);
                      }
                      e.target.value = '';
                    }}
                    disabled={uploading}
                  />
                  <label
                    htmlFor={`file-upload-${topico.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Enviar arquivo
                      </>
                    )}
                  </label>
                </div>
              </header>

              {uploadError && (
                <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                  {uploadError}
                </div>
              )}

              {uploading && (
                <div className="mb-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-foreground/40">Enviando... {uploadProgress}%</p>
                </div>
              )}

              <ul className="mt-5 space-y-2">
                {currentFiles.length > 0 ? (
                  currentFiles.map((a) => {
                    const Icon = getIconByType(a.tipo);
                    const cor = getIconCor(a.tipo);
                    // Extrair caminho do arquivo da URL pública
                    let filePath = '';
                    try {
                      const url = new URL(a.url);
                      filePath = url.pathname.replace(`/storage/v1/object/public/topic-files/`, '');
                    } catch (e) {
                      filePath = `${a.user_id}/${a.topico_id}/...`;
                    }
                    return (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
                        <div className={`grid h-9 w-9 place-items-center rounded-md ${cor}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.nome}</div>
                          <div className="text-[11px] text-foreground/45">
                            {a.tipo} · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                          </div>
                          {a.descricao && <div className="text-xs text-foreground/40">{a.descricao}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid h-7 w-7 place-items-center rounded-md text-primary/70 hover:text-primary transition-colors"
                            title="Abrir arquivo"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </a>
                          <button
                            onClick={() => handleRemoveFile(a.id, filePath, topico.id)}
                            disabled={isDeleting}
                            className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-accent/10 hover:text-accent transition-colors disabled:opacity-50"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="py-4 text-center text-xs text-foreground/40">
                    Nenhum material anexado ainda.
                  </li>
                )}
              </ul>
            </div>

            {/* NOTAS */}
            <div className="rf-card p-6">
              <header className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-widest text-foreground/40">Notas e anotações</h3>
                  <p className="mt-1 text-xs text-foreground/55">Resumos rápidos, insights e pontos-chave.</p>
                </div>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface-2">
                  <Plus className="h-3.5 w-3.5" /> Nova nota
                </button>
              </header>
              <textarea rows={3} placeholder="Escreva uma nova anotação…" className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
              <p className="mt-2 text-xs text-foreground/40 italic">Funcionalidade de notas em breve.</p>
            </div>
          </section>

          {/* Sidebar - com revisões */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rf-card p-5">
              <header className="mb-3 text-xs font-medium uppercase tracking-widest text-foreground/40">Progresso</header>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {topico.status === "dominado" ? "100%" : topico.status === "revisado" ? "75%" : topico.status === "estudando" ? "50%" : "0%"}
                </span>
                <span className="text-xs text-foreground/50">dominado</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ 
                  width: topico.status === "dominado" ? "100%" : topico.status === "revisado" ? "75%" : topico.status === "estudando" ? "50%" : "0%" 
                }} />
              </div>
              <ul className="mt-4 space-y-2 text-xs">
                <Row k="Última revisão" v="hoje, 09:12" />
                <Row k="Próxima revisão" v={proximaRevisao ? new Date(proximaRevisao.nextReviewDate).toLocaleDateString('pt-BR') : "—"} />
                <Row k="Acertos no tópico" v="86%" />
              </ul>
            </div>

            {/* Revisões agendadas */}
            {revisoesTopico.length > 0 && (
              <div className="rf-card p-5">
                <header className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-foreground/40">
                  <Clock className="h-3 w-3 text-primary" /> Revisões programadas (DSM-30)
                </header>
                <ul className="space-y-2 text-xs">
                  {revisoesTopico
                    .sort((a, b) => a.review_level - b.review_level)
                    .map((rev) => {
                      const levels = ['1 dia', '7 dias', '15 dias', '30 dias', '60 dias'];
                      const label = levels[rev.review_level - 1] || `${rev.review_level} dias`;
                      const isCompleted = !!rev.completedAt;
                      return (
                        <li key={rev.id} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
                          <span className="flex items-center gap-1.5">
                            {isCompleted ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-foreground/40" />
                            )}
                            <span className={isCompleted ? "text-foreground/50 line-through" : "text-foreground/85"}>
                              {label}
                            </span>
                          </span>
                          <span className={isCompleted ? "text-foreground/40" : "text-foreground/70"}>
                            {isCompleted ? "✅ Concluída" : new Date(rev.nextReviewDate).toLocaleDateString('pt-BR')}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </AppShell>
    );
  }

  return null;
}

// ============================================================
// COMPONENTES VISUAIS
// ============================================================

function StatusBadge({ status }: { status: "em-andamento" | "concluido" | "iniciar" }) {
  const map = {
    "em-andamento": { l: "Em andamento", c: "bg-primary/10 text-primary" },
    "concluido": { l: "Concluído", c: "bg-primary/15 text-primary" },
    "iniciar": { l: "Iniciar", c: "bg-accent/10 text-accent" },
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[status].c}`}>{map[status].l}</span>;
}

function Mini({ l, v, icon, tone }: { l: string; v: React.ReactNode; icon?: React.ReactNode; tone?: "accent" }) {
  return (
    <div className="rf-card p-4">
      {icon && <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>}
      <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">{l}</div>
      <div className={["mt-1 font-display text-xl font-semibold tabular-nums", tone === "accent" ? "text-accent" : ""].join(" ")}>{v}</div>
    </div>
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