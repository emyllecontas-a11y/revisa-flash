import { AppShell } from "@/components/app-shell";
import { 
  Plus, Search, ChevronRight, ChevronLeft, FileText, Upload, 
  Layers, Pencil, Trash2, X, BookOpen, Sparkles, ImageIcon,
  FileSpreadsheet, Music, Calendar, Clock, CheckCircle2, Circle,
  Loader2, ChevronUp, ChevronDown
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { uid, gerenciarRevisao } from "@/utils/helpers";
import { getDb, syncWithSupabase } from "@/lib/db";
import { supabase, getSupabaseWithToken } from "@/lib/supabaseClient";
import { uploadFile, listFilesByTopic, deleteFile, FileRecord } from "@/services/fileService";
import { enqueueOperation } from "@/services/queueService";

// ============================================================
// TIPOS (CORRIGIDOS + order)
// ============================================================
interface Disciplina {
  id: string;
  name: string;
  user_id: string;
  createdAt: string;
  updated_at: string;
  isDeleted?: boolean;
}

interface Topico {
  id: string;
  discipline_id: string;
  name: string;
  status: string;
  planned_date: string | null;
  createdAt: string;
  updated_at: string;
  user_id: string;
  isDeleted?: boolean;
  order?: number; // 🔥 NOVO
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
export default function ConteudoPage() {
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
  // CARREGAR DADOS (COM isDeleted + ordenação por order + reindexação automática)
  // ============================================================
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();
      
      const disciplinesResult = await db.disciplines.find({
        selector: { 
          user_id: userId, 
          isDeleted: { $ne: true }
        }
      }).exec();
      setDisciplinas(disciplinesResult.map((doc: any) => doc.toJSON()));

      const topicsResult = await db.topics.find({
        selector: { 
          user_id: userId, 
          isDeleted: { $ne: true }
        }
      }).exec();
      const topicsData = topicsResult.map((doc: any) => doc.toJSON());

      // 🔥 Verifica se algum tópico tem order indefinido
      let hasUndefinedOrder = false;
      for (const t of topicsData) {
        if (t.order === undefined || t.order === null) {
          t.order = 0;
          hasUndefinedOrder = true;
        }
      }

      // 🔥 Se houver tópicos com order indefinido, reindexa TODOS por disciplina
      if (hasUndefinedOrder) {
        console.log('🔄 Reindexando tópicos com order indefinido...');
        const disciplines = [...new Set(topicsData.map(t => t.discipline_id))];
        for (const discId of disciplines) {
          const topicsOfDisc = topicsData.filter(t => t.discipline_id === discId);
          // Ordena por ordem atual ou data de criação
          topicsOfDisc.sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt));
          for (let i = 0; i < topicsOfDisc.length; i++) {
            topicsOfDisc[i].order = i;
          }
        }
        // Salva as alterações no banco local e no Supabase
        const now = new Date().toISOString();
        for (const t of topicsData) {
          const doc = await db.topics.findOne({ selector: { id: t.id } }).exec();
          if (doc) await doc.patch({ order: t.order, updated_at: now });
        }
        try {
          const supabaseClient = await getSupabaseWithToken();
          for (const t of topicsData) {
            await supabaseClient.from('topics').update({ order: t.order, updated_at: now }).eq('id', t.id);
          }
          console.log('✅ Reindexação sincronizada com Supabase.');
        } catch (e) {
          console.warn('⚠️ Falha ao sincronizar reindexação, enfileirando.');
          for (const t of topicsData) {
            await enqueueOperation('update', 'topics', { id: t.id, order: t.order, updated_at: now });
          }
        }
      }

      // Ordena para exibição
      topicsData.sort((a, b) => (a.order || 0) - (b.order || 0));
      setTopicos(topicsData);
      console.log('📊 [loadData] Tópicos carregados (nome:order):', topicsData.map(t => `${t.name}:${t.order}`).join(', '));

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

  // 🔥 LISTENER PARA RECARREGAR AUTOMATICAMENTE QUANDO HOUVER MUDANÇAS NO BANCO LOCAL
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    const subscribeToCollections = async () => {
      try {
        const db = await getDb();
        if (!db.collections) return;

        const subscriptions: any[] = [];

        if (db.collections.disciplines) {
          const sub = db.collections.disciplines.$.subscribe(() => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              if (isSubscribed) {
                console.log('🔄 Mudança detectada em disciplines, recarregando...');
                loadData();
              }
              timeoutId = null;
            }, 500);
          });
          subscriptions.push(sub);
        }

        if (db.collections.topics) {
          const sub = db.collections.topics.$.subscribe(() => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              if (isSubscribed) {
                console.log('🔄 Mudança detectada em topics, recarregando...');
                loadData();
              }
              timeoutId = null;
            }, 500);
          });
          subscriptions.push(sub);
        }

        return () => {
          isSubscribed = false;
          if (timeoutId) clearTimeout(timeoutId);
          subscriptions.forEach(sub => sub.unsubscribe());
        };
      } catch (e) {
        console.warn('Erro ao configurar listener de conteúdo:', e);
      }
    };

    subscribeToCollections();
  }, [loadData]);

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

  // 🔥 Função para obter a próxima ordem
  const getNextOrder = useCallback((disciplineId: string) => {
    const topicsOfDiscipline = topicos.filter(t => t.discipline_id === disciplineId);
    if (topicsOfDiscipline.length === 0) return 0;
    const maxOrder = Math.max(...topicsOfDiscipline.map(t => t.order || 0));
    return maxOrder + 1;
  }, [topicos]);

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

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const fileRecord = await uploadFile(file, topicId, disciplinaNome, userId) as FileRecord;

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
  // CRUD CORRIGIDO (COM updated_at E isDeleted + order)
  // ============================================================

  // ---------- CRIAR DISCIPLINA ----------
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
      
      const newDiscipline = {
        id,
        name: discNome.trim(),
        user_id: userId,
        createdAt: now,
        updated_at: now,
        isDeleted: false,
      };

      // 1. Salva localmente
      await db.disciplines.insert(newDiscipline);

      // 2. Tenta sincronizar com Supabase
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('disciplines')
          .insert(newDiscipline);
        if (error) throw error;
        console.log('✅ [ConteudoPage] Disciplina sincronizada com Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [ConteudoPage] Falha ao sincronizar disciplina, enfileirando.');
        await enqueueOperation('create', 'disciplines', newDiscipline);
      }

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

  // ---------- CRIAR TÓPICO (COM order) ----------
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

      const nextOrder = getNextOrder(selectedDisciplineId); // 🔥
      
      const newTopic = {
        id,
        discipline_id: selectedDisciplineId,
        name: topicoNome.trim(),
        status: topicoStatus,
        planned_date: null,
        createdAt: now,
        updated_at: now,
        user_id: userId,
        isDeleted: false,
        order: nextOrder, // 🔥
      };

      await db.topics.insert(newTopic);

      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient
          .from('topics')
          .insert(newTopic);
        if (error) throw error;
        console.log('✅ [ConteudoPage] Tópico sincronizado com Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [ConteudoPage] Falha ao sincronizar tópico, enfileirando.');
        await enqueueOperation('create', 'topics', newTopic);
      }

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
  }, [selectedDisciplineId, topicoNome, topicoDesc, topicoStatus, userId, loadData, getNextOrder]);

  // ---------- Mover tópico (subir/descer) – REINDEXA APENAS A DISCIPLINA AFETADA ----------
  const moveTopic = useCallback(async (id: string, direction: 'up' | 'down') => {
    console.log('🔁 moveTopic chamado:', id, direction);
    const db = await getDb();
    const allTopics = [...topicos];
    const index = allTopics.findIndex(t => t.id === id);
    if (index === -1) return;

    // Encontra a disciplina do tópico
    const disciplineId = allTopics[index].discipline_id;
    const topicsOfDiscipline = allTopics.filter(t => t.discipline_id === disciplineId);
    const indexInDiscipline = topicsOfDiscipline.findIndex(t => t.id === id);
    
    const newIndexInDiscipline = direction === 'up' ? indexInDiscipline - 1 : indexInDiscipline + 1;
    if (newIndexInDiscipline < 0 || newIndexInDiscipline >= topicsOfDiscipline.length) return;

    // Troca a posição no array da disciplina
    const [removed] = topicsOfDiscipline.splice(indexInDiscipline, 1);
    topicsOfDiscipline.splice(newIndexInDiscipline, 0, removed);

    // Reindexa a disciplina inteira
    const now = new Date().toISOString();
    for (let i = 0; i < topicsOfDiscipline.length; i++) {
      const t = topicsOfDiscipline[i];
      t.order = i;
      t.updated_at = now;
      // Atualiza no banco local
      const doc = await db.topics.findOne({ selector: { id: t.id } }).exec();
      if (doc) await doc.patch({ order: i, updated_at: now });
    }

    // Atualiza o estado global (substitui os tópicos da disciplina no array principal)
    const updatedAllTopics = allTopics.filter(t => t.discipline_id !== disciplineId).concat(topicsOfDiscipline);
    updatedAllTopics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setTopicos(updatedAllTopics);
    console.log('📊 [moveTopic] Tópicos reindexados da disciplina:', topicsOfDiscipline.map(t => `${t.name}:${t.order}`).join(', '));

    // Sincroniza com Supabase
    try {
      const supabaseClient = await getSupabaseWithToken();
      for (const t of topicsOfDiscipline) {
        await supabaseClient.from('topics').update({ order: t.order, updated_at: now }).eq('id', t.id);
      }
      console.log('✅ [ConteudoPage] Ordens reindexadas no Supabase.');
    } catch (error) {
      console.warn('⚠️ [ConteudoPage] Falha ao sincronizar ordem, enfileirando.');
      for (const t of topicsOfDiscipline) {
        await enqueueOperation('update', 'topics', { id: t.id, order: t.order, updated_at: now });
      }
    }

    // Recarrega para garantir consistência (opcional, mas já atualizamos o estado)
    // await loadData();
  }, [topicos]);

  // ---------- EXCLUIR DISCIPLINA (SOFT DELETE) ----------
  const handleDeleteDiscipline = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta disciplina e todos os seus tópicos?")) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      // 🔥 1. Soft delete local (sempre faz)
      const disciplineDoc = await db.disciplines.findOne({ selector: { id } }).exec();
      if (disciplineDoc) {
        await disciplineDoc.patch({ isDeleted: true, updated_at: now });
      }

      const topics = await db.topics.find({ selector: { discipline_id: id } }).exec();
      const topicIds = topics.map(t => t.id);
      for (const t of topics) {
        await t.patch({ isDeleted: true, updated_at: now });
        const revisoesTopico = await db.revisoes.find({ selector: { topico_id: t.id } }).exec();
        for (const r of revisoesTopico) {
          await r.remove();
        }
      }

      // 🔥 2. Tenta enviar direto para o Supabase
      try {
        const supabaseClient = await getSupabaseWithToken();
        await supabaseClient.from('disciplines').update({ isDeleted: true, updated_at: now }).eq('id', id);
        for (const tid of topicIds) {
          await supabaseClient.from('topics').update({ isDeleted: true, updated_at: now }).eq('id', tid);
        }
        console.log('✅ [ConteudoPage] Disciplina excluída no Supabase.');
      } catch (supabaseError) {
        console.warn('⚠️ [ConteudoPage] Falha ao excluir no Supabase, enfileirando.');
        await enqueueOperation('update', 'disciplines', { id, isDeleted: true, updated_at: now });
        for (const tid of topicIds) {
          await enqueueOperation('update', 'topics', { id: tid, isDeleted: true, updated_at: now });
        }
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

  // ---------- EXCLUIR TÓPICO (SOFT DELETE) ----------
  const handleDeleteTopic = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este tópico?")) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      const doc = await db.topics.findOne({ selector: { id } }).exec();
      if (doc) {
        // 🔥 Soft delete local
        await doc.patch({ isDeleted: true, updated_at: now });

        const revisoesTopico = await db.revisoes.find({ selector: { topico_id: id } }).exec();
        for (const r of revisoesTopico) {
          await r.remove();
        }

        // 🔥 Tenta enviar direto para o Supabase
        try {
          const supabaseClient = await getSupabaseWithToken();
          await supabaseClient.from('topics').update({ isDeleted: true, updated_at: now }).eq('id', id);
          for (const r of revisoesTopico) {
            await supabaseClient.from('revisoes').delete().eq('id', r.id);
          }
          console.log('✅ [ConteudoPage] Tópico excluído no Supabase.');
        } catch (supabaseError) {
          console.warn('⚠️ [ConteudoPage] Falha ao excluir tópico no Supabase, enfileirando.');
          await enqueueOperation('update', 'topics', { id, isDeleted: true, updated_at: now });
          for (const r of revisoesTopico) {
            await enqueueOperation('delete', 'revisoes', { id: r.id });
          }
        }

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

  // ---------- GERENCIAR REVISÕES ----------
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
          await enqueueOperation('delete', 'revisoes', { id: doc.id });
        }
      }

      for (const rev of novasRevisoes) {
        const topicoIdFinal = rev.topicoId || topicoId;
        const topicNameFinal = rev.topicoNome || topicoNome;
        const disciplineFinal = rev.disciplina || disciplinaNome;
        const reviewLevelFinal = rev.reviewLevel || 1;
        const nextReviewDateFinal = rev.nextReviewDate || new Date(Date.now() + 86400000).toISOString();
        const lastStudyDateFinal = rev.lastStudyDate || new Date().toISOString();

        const existingDoc = existingDocs.find(d => d.id === rev.id);
        const revisaoData = {
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
        };

        if (existingDoc) {
          await existingDoc.patch({
            review_level: reviewLevelFinal,
            nextReviewDate: nextReviewDateFinal,
            lastStudyDate: lastStudyDateFinal,
            completedAt: rev.completedAt || null,
            updatedAt: new Date().toISOString()
          });
          await enqueueOperation('update', 'revisoes', { 
            id: rev.id, 
            review_level: reviewLevelFinal,
            nextReviewDate: nextReviewDateFinal,
            lastStudyDate: lastStudyDateFinal,
            completedAt: rev.completedAt || null,
            updatedAt: new Date().toISOString()
          });
        } else {
          await db.revisoes.insert(revisaoData);
          await enqueueOperation('create', 'revisoes', revisaoData);
        }
      }

      await loadData();
      console.log('✅ Revisões atualizadas com sucesso (local e fila)');
    } catch (error) {
      console.error('❌ Erro ao gerenciar revisões:', error);
      throw error;
    }
  }, [userId, loadData]);

  // ---------- ATUALIZAR STATUS DO TÓPICO ----------
  const handleUpdateTopicStatus = useCallback(async (id: string, newStatus: string) => {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const doc = await db.topics.findOne({ selector: { id } }).exec();
      if (doc) {
        const topicoData = doc.toJSON();
        const disciplina = getDisciplinaById(topicoData.discipline_id);

        // 1. Atualiza localmente
        await doc.patch({
          status: newStatus,
          updated_at: now
        });

        // 2. Enfileira atualização
        await enqueueOperation('update', 'topics', { id, status: newStatus, updated_at: now });

        // 3. Gerencia revisões
        await gerenciarRevisoesTopico(
          id,
          topicoData.name,
          disciplina?.name || 'Disciplina',
          newStatus
        );

        await loadData();
        console.log('✅ Status do tópico atualizado com sucesso (local e fila)');
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

          <div id="conteudo-header" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
  // RENDER: DETALHES DA DISCIPLINA (COM BOTÕES DE ORDENAÇÃO)
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
              topicosDaDisciplina.map((t, index) => {
                const statusMap: Record<string, { label: string; className: string }> = {
                  "nao_estudado": { label: "Não iniciado", className: "bg-accent/10 text-accent" },
                  "estudando": { label: "Estudando", className: "bg-primary/10 text-primary" },
                  "revisado": { label: "Revisado", className: "bg-primary/15 text-primary" },
                  "dominado": { label: "Dominado", className: "bg-green-500/10 text-green-400" },
                };
                const status = statusMap[t.status] || statusMap["nao_estudado"];
                const isFirst = index === 0;
                const isLast = index === topicosDaDisciplina.length - 1;
                return (
                  <div key={t.id} className="rf-card rf-card-hover group flex items-center gap-4 p-5 w-full">
                    <button
                      onClick={() => abrirTopico(t.id)}
                      className="flex items-center gap-4 flex-1 text-left"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background/60 font-display text-sm font-semibold text-foreground/70 tabular-nums">
                        {index + 1}
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
                    </button>
                    {/* 🔥 BOTÕES DE ORDENAÇÃO */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveTopic(t.id, 'up')}
                        disabled={isFirst}
                        className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveTopic(t.id, 'down')}
                        disabled={isLast}
                        className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
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
  // RENDER: DETALHES DO TÓPICO (SEM MUDANÇAS)
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
            {/* MATERIAIS */}
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
let filePath = '';
console.log('🔍 URL do arquivo:', a.url);
try {
  const match = a.url.match(/\/topic-files\/([^?]+)/);
  if (match) {
    filePath = decodeURIComponent(match[1]);
    console.log('✅ filePath extraído por regex:', filePath);
  } else {
    console.warn('⚠️ Regex não encontrou, usando fallback');
    filePath = `${a.user_id}/${a.topico_id}/${a.nome}`;
    console.log('🔧 filePath fallback:', filePath);
  }
} catch (e) {
  console.error('❌ Erro ao extrair filePath:', e);
  filePath = `${a.user_id}/${a.topico_id}/${a.nome}`;
}
console.log('📁 filePath final:', filePath);
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

          {/* Sidebar */}
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