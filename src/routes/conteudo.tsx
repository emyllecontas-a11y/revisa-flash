// src/routes/conteudo.tsx
import { AppShell } from "@/components/app-shell";
import {
  Plus, Search, ChevronRight, ChevronLeft, FileText, Upload,
  Layers, Pencil, Trash2, X, BookOpen, Sparkles, ImageIcon,
  FileSpreadsheet, Music, Calendar, Clock, CheckCircle2, Circle,
  Loader2, ChevronUp, ChevronDown, Folder, MoreHorizontal,
  BookOpenCheck, Download, HardDriveDownload, FileQuestion, Check
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { uid, gerenciarRevisao } from "@/utils/helpers";
import { getDb } from "@/lib/db";
import { supabase, getSupabaseWithToken } from "@/lib/supabaseClient";
import { uploadFile, listFilesByTopic, deleteFile, resolveStoragePath, FileRecord } from "@/services/fileService";
import { enqueueOperation } from "@/services/queueService";
import { deletePdfBlob, ensureCached, listCachedPdfIds } from "@/services/pdfCache";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

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
  order?: number;
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
function getTopicIcon(status: string) {
  switch (status) {
    case "estudando":
      return BookOpen;
    case "revisado":
      return BookOpenCheck;
    case "dominado":
      return Check;
    case "nao_estudado":
    default:
      return FileQuestion;
  }
}

export default function ConteudoPage() {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

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

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  // IDs dos PDFs já disponíveis offline (cache local)
  const [cachedFileIds, setCachedFileIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    (async () => {
      try {
        const ids = await listCachedPdfIds();
        setCachedFileIds(new Set(ids));
      } catch (e) {
        console.warn('[conteudo] Falha ao listar PDFs em cache:', e);
      }
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const db = await getDb();

      const disciplinesResult = await db.disciplines.find({
        selector: { user_id: userId, isDeleted: { $ne: true } }
      }).exec();
      setDisciplinas(disciplinesResult.map((doc: any) => doc.toJSON()));

      const topicsResult = await db.topics.find({
        selector: { user_id: userId, isDeleted: { $ne: true } }
      }).exec();
      const topicsData = topicsResult.map((doc: any) => doc.toJSON());

      let hasUndefinedOrder = false;
      for (const t of topicsData) {
        if (t.order === undefined || t.order === null) {
          t.order = 0;
          hasUndefinedOrder = true;
        }
      }

      if (hasUndefinedOrder) {
        const disciplines = [...new Set(topicsData.map(t => t.discipline_id))];
        for (const discId of disciplines) {
          const topicsOfDisc = topicsData.filter(t => t.discipline_id === discId);
          topicsOfDisc.sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt) - new Date(b.createdAt));
          for (let i = 0; i < topicsOfDisc.length; i++) {
            topicsOfDisc[i].order = i;
          }
        }
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
        } catch (e) {
          for (const t of topicsData) {
            await enqueueOperation('update', 'topics', { id: t.id, order: t.order, updated_at: now });
          }
        }
      }

      topicsData.sort((a, b) => (a.order || 0) - (b.order || 0));
      setTopicos(topicsData);

      const revisoesResult = await db.revisoes.find({ selector: { user_id: userId } }).exec();
      setRevisoes(revisoesResult.map((doc: any) => doc.toJSON()));

    } catch (error) {
      console.error('Erro ao carregar dados do RxDB:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

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
            timeoutId = setTimeout(() => { if (isSubscribed) loadData(); timeoutId = null; }, 500);
          });
          subscriptions.push(sub);
        }
        if (db.collections.topics) {
          const sub = db.collections.topics.$.subscribe(() => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => { if (isSubscribed) loadData(); timeoutId = null; }, 500);
          });
          subscriptions.push(sub);
        }

        return () => {
          isSubscribed = false;
          if (timeoutId) clearTimeout(timeoutId);
          subscriptions.forEach(sub => sub.unsubscribe());
        };
      } catch (e) {
        console.warn('Erro ao configurar listener:', e);
      }
    };

    subscribeToCollections();
  }, [loadData]);

  const getDisciplinaById = useCallback((id: string) => disciplinas.find(d => d.id === id), [disciplinas]);
  const getTopicosPorDisciplina = useCallback((disciplineId: string) => topicos.filter(t => t.discipline_id === disciplineId), [topicos]);
  const getTopicoById = useCallback((id: string) => topicos.find(t => t.id === id), [topicos]);
  const getRevisoesPorTopico = useCallback((topicoId: string) => revisoes.filter(r => r.topico_id === topicoId && !r.completedAt), [revisoes]);

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
      const db = await getDb();
      const col = db.collections.files;
      if (col) {
        const all = await col.find().exec();
        const docs = all.filter((d: any) => {
          return d.get('topico_id') === topicId && d.get('user_id') === userId;
        });
        if (docs.length > 0) {
          const localFiles = docs.map((d: any) => d.toJSON() as FileRecord);
          localFiles.sort((a, b) =>
            (b.created_at || '').localeCompare(a.created_at || '')
          );
          setFilesMap(prev => ({ ...prev, [topicId]: localFiles }));
          return;
        }
      }
    } catch (e) {
      console.warn('[conteudo] Falha ao ler files do RxDB:', e);
    }

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) {
      setFilesMap(prev => ({ ...prev, [topicId]: prev[topicId] || [] }));
      return;
    }

    try {
      const files = await listFilesByTopic(topicId, userId);
      setFilesMap(prev => ({ ...prev, [topicId]: files }));

      try {
        const db = await getDb();
        const col = db.collections.files;
        if (col) {
          for (const f of files) {
            const existing = await col.findOne({ selector: { id: f.id } }).exec();
            if (!existing) {
              await col.insert({ ...f, updated_at: f.created_at });
            }
          }
        }
      } catch (saveErr) {
        console.warn('[conteudo] Falha ao salvar files no RxDB:', saveErr);
      }
    } catch (error) {
      console.warn('[conteudo] Erro ao carregar arquivos do Supabase:', error);
    }
  }, [userId]);

  const getNextOrder = useCallback((disciplineId: string) => {
    const topicsOfDiscipline = topicos.filter(t => t.discipline_id === disciplineId);
    if (topicsOfDiscipline.length === 0) return 0;
    return Math.max(...topicsOfDiscipline.map(t => t.order || 0)) + 1;
  }, [topicos]);

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

      setFilesMap(prev => ({ ...prev, [topicId]: [fileRecord, ...(prev[topicId] || [])] }));

      try {
        const col = db.collections.files;
        if (col) {
          const existing = await col.findOne({ selector: { id: fileRecord.id } }).exec();
          if (!existing) {
            await col.insert({ ...fileRecord, updated_at: fileRecord.created_at });
          }
        }
      } catch (saveErr) {
        console.warn('[conteudo] Falha ao salvar file no RxDB após upload:', saveErr);
      }
    } catch (error: any) {
      console.error('❌ Erro no upload:', error);
      setUploadError(error.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, [userId, getDisciplinaById]);

  const handleToggleOffline = useCallback(async (file: FileRecord) => {
    const jaCacheado = cachedFileIds.has(file.id);
    if (jaCacheado) {
      await deletePdfBlob(file.id);
      setCachedFileIds(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      toast.success('Cópia offline removida');
    } else {
      const result = await ensureCached(file.id, file.url, file.nome);
      if (result.cached) {
        setCachedFileIds(prev => {
          const next = new Set(prev);
          next.add(file.id);
          return next;
        });
        toast.success('Disponível offline');
      } else {
        const msg = result.reason === 'quota'
          ? 'Sem espaço no navegador'
          : result.reason === 'size'
          ? 'Arquivo muito grande (limite 100 MB)'
          : 'Falha ao baixar. Verifique sua conexão.';
        toast.error(msg);
      }
    }
  }, [cachedFileIds, toast]);

  const handleRemoveFile = useCallback(async (fileId: string, filePath: string, topicId: string) => {
    const ok = await confirmDialog({
      title: "Remover este arquivo?",
      description: "O material será removido deste tópico, junto com os grifos, anotações e caixas de texto vinculados.",
      confirmText: "Remover",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await deleteFile(fileId, filePath);

      setFilesMap(prev => ({ ...prev, [topicId]: (prev[topicId] || []).filter(f => f.id !== fileId) }));

      try {
        const dbLocal = await getDb();
        const fileDoc = await dbLocal.collections.files
          .findOne({ selector: { id: fileId } })
          .exec();
        if (fileDoc) {
          await fileDoc.remove();
          console.log(`[conteudo] Removido do RxDB: files/${fileId}`);
        }
      } catch (dbErr) {
        console.warn('[conteudo] Falha ao remover file do RxDB:', dbErr);
      }

      try {
        const db = await getDb();
        const now = new Date().toISOString();

        const highlights = await db.collections.pdf_highlights.find({
          selector: { file_id: fileId }
        }).exec();
        for (const h of highlights) {
          const j = h.toJSON();
          await h.patch({ isDeleted: true, updated_at: now });
          await enqueueOperation('update', 'pdf_highlights', { id: j.id, isDeleted: true, updated_at: now });
        }

        const notes = await db.collections.pdf_notes.find({
          selector: { file_id: fileId }
        }).exec();
        for (const n of notes) {
          const j = n.toJSON();
          await n.patch({ isDeleted: true, updated_at: now });
          await enqueueOperation('update', 'pdf_notes', { id: j.id, isDeleted: true, updated_at: now });
        }

        const boxes = await db.collections.pdf_text_boxes.find({
          selector: { file_id: fileId }
        }).exec();
        for (const b of boxes) {
          const j = b.toJSON();
          await b.patch({ isDeleted: true, updated_at: now });
          await enqueueOperation('update', 'pdf_text_boxes', { id: j.id, isDeleted: true, updated_at: now });
        }

        if (highlights.length + notes.length + boxes.length > 0) {
          console.log(`[conteudo] Cascade removeu: ${highlights.length} grifos, ${notes.length} notas, ${boxes.length} caixas.`);
        }
      } catch (cascadeErr) {
        console.warn('[conteudo] Falha no cascade de remoção:', cascadeErr);
      }

      try {
        await deletePdfBlob(fileId);
        setCachedFileIds(prev => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      } catch (blobErr) {
        console.warn('[conteudo] Falha ao remover blob do cache:', blobErr);
      }
    } catch (error) {
      console.error('❌ Erro ao remover arquivo:', error);
      alert('Erro ao remover arquivo.');
    } finally {
      setIsDeleting(false);
    }
  }, [confirmDialog]);

  const handleCreateDiscipline = useCallback(async () => {
    if (!discNome.trim()) { setErrorMessage("Digite um nome para a disciplina"); return; }
    if (!userId) { setErrorMessage("Usuário não autenticado"); return; }
    try {
      setIsSaving(true);
      const now = new Date().toISOString();
      const id = uid();
      const db = await getDb();
      const newDiscipline = { id, name: discNome.trim(), user_id: userId, createdAt: now, updated_at: now, isDeleted: false };
      await db.disciplines.insert(newDiscipline);
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient.from('disciplines').insert(newDiscipline);
        if (error) throw error;
      } catch (supabaseError) {
        await enqueueOperation('create', 'disciplines', newDiscipline);
      }
      setDiscNome(""); setDiscDesc(""); setIsModalOpen(false); setErrorMessage("");
      await loadData();
    } catch (error: any) {
      setErrorMessage("Erro ao criar disciplina: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [discNome, discDesc, userId, loadData]);

  const handleCreateTopic = useCallback(async () => {
    if (!selectedDisciplineId) { setErrorMessage("Selecione uma disciplina primeiro"); return; }
    if (!topicoNome.trim()) { setErrorMessage("Digite um nome para o tópico"); return; }
    if (!userId) { setErrorMessage("Usuário não autenticado"); return; }
    try {
      setIsSaving(true);
      const now = new Date().toISOString();
      const id = uid();
      const db = await getDb();
      const nextOrder = getNextOrder(selectedDisciplineId);
      const newTopic = {
        id, discipline_id: selectedDisciplineId, name: topicoNome.trim(),
        status: topicoStatus, planned_date: null, createdAt: now, updated_at: now,
        user_id: userId, isDeleted: false, order: nextOrder,
      };
      await db.topics.insert(newTopic);
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { error } = await supabaseClient.from('topics').insert(newTopic);
        if (error) throw error;
      } catch (supabaseError) {
        await enqueueOperation('create', 'topics', newTopic);
      }
      setTopicoNome(""); setTopicoDesc(""); setTopicoStatus("nao_estudado");
      setIsAddTopicModalOpen(false); setErrorMessage("");
      await loadData();
    } catch (error: any) {
      setErrorMessage("Erro ao criar tópico: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [selectedDisciplineId, topicoNome, topicoDesc, topicoStatus, userId, loadData, getNextOrder]);

  const moveTopic = useCallback(async (id: string, direction: 'up' | 'down') => {
    const db = await getDb();
    const allTopics = [...topicos];
    const index = allTopics.findIndex(t => t.id === id);
    if (index === -1) return;

    const disciplineId = allTopics[index].discipline_id;
    const topicsOfDiscipline = allTopics.filter(t => t.discipline_id === disciplineId);
    const indexInDiscipline = topicsOfDiscipline.findIndex(t => t.id === id);

    const newIndexInDiscipline = direction === 'up' ? indexInDiscipline - 1 : indexInDiscipline + 1;
    if (newIndexInDiscipline < 0 || newIndexInDiscipline >= topicsOfDiscipline.length) return;

    const [removed] = topicsOfDiscipline.splice(indexInDiscipline, 1);
    topicsOfDiscipline.splice(newIndexInDiscipline, 0, removed);

    const now = new Date().toISOString();
    for (let i = 0; i < topicsOfDiscipline.length; i++) {
      const t = topicsOfDiscipline[i];
      t.order = i; t.updated_at = now;
      const doc = await db.topics.findOne({ selector: { id: t.id } }).exec();
      if (doc) await doc.patch({ order: i, updated_at: now });
    }

    const updatedAllTopics = allTopics.filter(t => t.discipline_id !== disciplineId).concat(topicsOfDiscipline);
    updatedAllTopics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setTopicos(updatedAllTopics);

    try {
      const supabaseClient = await getSupabaseWithToken();
      for (const t of topicsOfDiscipline) {
        await supabaseClient.from('topics').update({ order: t.order, updated_at: now }).eq('id', t.id);
      }
    } catch (error) {
      for (const t of topicsOfDiscipline) {
        await enqueueOperation('update', 'topics', { id: t.id, order: t.order, updated_at: now });
      }
    }
  }, [topicos]);

  const handleDeleteDiscipline = useCallback(async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir esta disciplina?",
      description: "Os tópicos, revisões e erros vinculados também serão removidos.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();

      const disciplineDoc = await db.disciplines.findOne({ selector: { id } }).exec();
      if (disciplineDoc) await disciplineDoc.patch({ isDeleted: true, updated_at: now });

      const errosDaDisciplina = await db.errors.find({ selector: { discipline_id: id } }).exec();
      const erroIds: string[] = [];
      for (const e of errosDaDisciplina) {
        const j = e.toJSON();
        erroIds.push(j.id);
        await e.patch({ isDeleted: true, updated_at: now });
      }

      const topics = await db.topics.find({ selector: { discipline_id: id } }).exec();
      const topicIds = topics.map(t => t.id);
      for (const t of topics) {
        await t.patch({ isDeleted: true, updated_at: now });
        const revisoesTopico = await db.revisoes.find({ selector: { topico_id: t.id } }).exec();
        for (const r of revisoesTopico) await r.remove();
      }

      try {
        const supabaseClient = await getSupabaseWithToken();
        await supabaseClient.from('disciplines').update({ isDeleted: true, updated_at: now }).eq('id', id);
        await supabaseClient.from('errors').update({ isDeleted: true, updated_at: now }).eq('discipline_id', id);
        for (const tid of topicIds) {
          await supabaseClient.from('topics').update({ isDeleted: true, updated_at: now }).eq('id', tid);
        }
        if (userId) {
          const { error: rpcErr } = await supabaseClient.rpc('excluir_disciplina_conteudo', { p_discipline_id: id, p_user_id: userId });
          if (rpcErr) console.warn('Falha ao limpar conteúdo:', rpcErr);
        }
      } catch (supabaseError) {
        await enqueueOperation('update', 'disciplines', { id, isDeleted: true, updated_at: now });
        for (const tid of topicIds) {
          await enqueueOperation('update', 'topics', { id: tid, isDeleted: true, updated_at: now });
        }
        for (const erroId of erroIds) {
          await enqueueOperation('update', 'errors', { id: erroId, isDeleted: true, updated_at: now });
        }
      }

      if (selectedDisciplineId === id) {
        setSelectedDisciplineId(null);
        setModo("disciplinas");
      }
      await loadData();
      setErrorMessage("✅ Disciplina e erros vinculados excluídos!");
      setTimeout(() => setErrorMessage(""), 3000);
    } catch (error: any) {
      setErrorMessage("Erro ao deletar disciplina: " + (error.message || "Erro desconhecido"));
    }
  }, [selectedDisciplineId, loadData, userId, confirmDialog]);

  const handleDeleteTopic = useCallback(async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir este tópico?",
      description: "As revisões programadas serão removidas.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const doc = await db.topics.findOne({ selector: { id } }).exec();
      if (doc) {
        await doc.patch({ isDeleted: true, updated_at: now });
        const revisoesTopico = await db.revisoes.find({ selector: { topico_id: id } }).exec();
        for (const r of revisoesTopico) await r.remove();

        try {
          const supabaseClient = await getSupabaseWithToken();
          await supabaseClient.from('topics').update({ isDeleted: true, updated_at: now }).eq('id', id);
          for (const r of revisoesTopico) {
            await supabaseClient.from('revisoes').delete().eq('id', r.id);
          }
        } catch (supabaseError) {
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
      setErrorMessage("Erro ao deletar tópico: " + (error.message || "Erro desconhecido"));
    }
  }, [selectedTopicId, loadData, confirmDialog]);

  const gerenciarRevisoesTopico = useCallback(async (
    topicoId: string, topicoNome: string, disciplinaNome: string, novoStatus: string
  ) => {
    if (!userId) return;
    try {
      const db = await getDb();
      const existingDocs = await db.revisoes.find({ selector: { user_id: userId, topico_id: topicoId } }).exec();
      const existingRevisoes = existingDocs.map((doc: any) => doc.toJSON());

      const novasRevisoes = gerenciarRevisao(topicoId, topicoNome, disciplinaNome, novoStatus, existingRevisoes);

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
          id: rev.id, user_id: userId, topico_id: topicoIdFinal,
          topicName: topicNameFinal, discipline: disciplineFinal,
          review_level: reviewLevelFinal, nextReviewDate: nextReviewDateFinal,
          lastStudyDate: lastStudyDateFinal, completedAt: rev.completedAt || null,
          createdAt: rev.createdAt || new Date().toISOString(), updated_at: new Date().toISOString()
        };

        if (existingDoc) {
          await existingDoc.patch({
            review_level: reviewLevelFinal, nextReviewDate: nextReviewDateFinal,
            lastStudyDate: lastStudyDateFinal, completedAt: rev.completedAt || null,
            updated_at: new Date().toISOString()
          });
          await enqueueOperation('update', 'revisoes', { id: rev.id, review_level: reviewLevelFinal, nextReviewDate: nextReviewDateFinal, lastStudyDate: lastStudyDateFinal, completedAt: rev.completedAt || null, updated_at: new Date().toISOString() });
        } else {
          await db.revisoes.insert(revisaoData);
          await enqueueOperation('create', 'revisoes', revisaoData);
        }
      }
      await loadData();
    } catch (error) {
      console.error('❌ Erro ao gerenciar revisões:', error);
      throw error;
    }
  }, [userId, loadData]);

  const handleUpdateTopicStatus = useCallback(async (id: string, newStatus: string) => {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const doc = await db.topics.findOne({ selector: { id } }).exec();
      if (doc) {
        const topicoData = doc.toJSON();
        const disciplina = getDisciplinaById(topicoData.discipline_id);
        await doc.patch({ status: newStatus, updated_at: now });
        await enqueueOperation('update', 'topics', { id, status: newStatus, updated_at: now });
        await gerenciarRevisoesTopico(id, topicoData.name, disciplina?.name || 'Disciplina', newStatus);
        await loadData();
      }
    } catch (error: any) {
      setErrorMessage("Erro ao atualizar status: " + (error.message || "Erro desconhecido"));
    }
  }, [getDisciplinaById, gerenciarRevisoesTopico, loadData]);

  const abrirDisciplina = useCallback((id: string) => {
    setSelectedDisciplineId(id);
    setModo("disciplina-detalhe");
    setSelectedTopicId(null);
  }, []);

  const abrirTopico = useCallback((id: string) => {
    setSelectedTopicId(id);
    setModo("topico-detalhe");
    if (userId) loadFilesForTopic(id);
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

  const ehPdf = (file: FileRecord) => {
    if (file.tipo === 'application/pdf') return true;
    if (file.nome?.toLowerCase().endsWith('.pdf')) return true;
    return false;
  };

  const CARD_COLORS = [
    '#E8A87C',
    '#E0A5C0',
    '#D4A88E',
    '#E8A87C',
    '#E0A5C0',
    '#D9A57E',
  ];
  const getCardColor = (index: number) => CARD_COLORS[index % CARD_COLORS.length];

  // ============================================================
  // RENDER: LISTA DE DISCIPLINAS
  // ============================================================
  if (modo === "disciplinas") {
    return (
      <>
        <AppShell breadcrumb="Conteúdo" title="Disciplinas e materiais">
          {errorMessage && (
            <div className={`mb-4 rounded-xl border p-3 text-sm ${
              errorMessage.includes("✅") ? "border-success/20 bg-success/20 text-success" : "border-destructive/20 bg-destructive/20 text-destructive"
            }`}>
              {errorMessage}
            </div>
          )}

          <div className="mb-6">
            <div className="relative mx-auto max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                placeholder="Buscar disciplina ou tópico"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-full border border-border bg-surface px-11 py-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
              />
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
            <button
              onClick={() => { setIsModalOpen(true); setErrorMessage(""); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Nova disciplina
            </button>
          </div>

          {disciplinasFiltradas.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {disciplinasFiltradas.map((d, index) => {
                const counts = getStatusCounts(d.id);
                const progresso = counts.total > 0 ? Math.round((counts.concluidos / counts.total) * 100) : 0;
                const cor = getCardColor(index);
                return (
                  <div
                    key={d.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrirDisciplina(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        abrirDisciplina(d.id);
                      }
                    }}
                    className="card-lip group p-5 flex flex-col min-h-[180px] text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ '--lip': cor } as React.CSSProperties}
                  >
                    <header className="mb-4 flex items-start justify-between">
                      <div
                        className="grid h-12 w-12 shrink-0 place-items-center"
                        style={{ color: cor }}
                      >
                        <Folder
                          className="h-8 w-8"
                          strokeWidth={2.4}
                          fill={`color-mix(in oklab, ${cor} 35%, transparent)`}
                        />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDiscipline(d.id); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-white/5 hover:text-destructive transition-colors"
                        aria-label="Excluir"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </header>

                    <h3 className="font-display text-base font-semibold tracking-tight line-clamp-2">
                      {d.name}
                    </h3>
                    <p className="mt-1 text-xs text-foreground/45">
                      {counts.total} tópico{counts.total !== 1 ? 's' : ''} · {progresso}% concluído
                    </p>

                    <div className="mt-auto pt-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progresso}%`,
                            background: `linear-gradient(90deg, ${cor}, color-mix(in oklab, ${cor} 70%, var(--accent)))`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
              <p className="text-sm text-foreground/40">
                {busca ? "Nenhuma disciplina encontrada para esta busca." : "Nenhuma disciplina criada. Clique em 'Nova disciplina' para começar."}
              </p>
            </div>
          )}
        </AppShell>

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
                    className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                    disabled={isSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateDiscipline}
                    disabled={isSaving}
                    className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
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
  // DETALHE DA DISCIPLINA
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
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Folder className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">Disciplina</span>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{disciplina.name}</h1>
                <p className="mt-1 max-w-xl text-sm text-foreground/55">Todos os tópicos desta disciplina.</p>
              </div>
            </div>
            <div className="flex gap-2 self-start sm:self-auto">
              <button
                onClick={() => { setIsAddTopicModalOpen(true); setErrorMessage(""); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Novo tópico
              </button>
              <button
                onClick={() => handleDeleteDiscipline(selectedDisciplineId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/15"
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

          {topicosDaDisciplina.length > 0 ? (
            <div className="topic-trail">
              {Array.from(
                { length: Math.ceil(topicosDaDisciplina.length / 3) },
                (_, grupoIdx) => {
                  const grupo = topicosDaDisciplina.slice(grupoIdx * 3, grupoIdx * 3 + 3);
                  const isReversed = grupoIdx % 2 === 1;

                  return (
                    <ol
                      key={grupoIdx}
                      className={`trail-nodes ${isReversed ? "trail-reverse" : ""}`}
                    >
                      {grupo.map((t, posNoGrupo) => {
                        const idxGlobal = grupoIdx * 3 + posNoGrupo;
                        const isCurrent = t.status === "estudando";
                        const isFirst = idxGlobal === 0;
                        const isLast = idxGlobal === topicosDaDisciplina.length - 1;

                        return (
                          <li
                            key={t.id}
                            className={`trail-node trail-position-${posNoGrupo} ${isCurrent ? "trail-current" : ""}`}
                          >
                            <div className="relative group">
                              <button
                                type="button"
                                className="trail-step inline-flex items-center"
                                onClick={() => abrirTopico(t.id)}
                                aria-label={`Abrir tópico: ${t.name}`}
                              >
                            <span className="trail-circle">
  {(() => {
    const IconeTopico = getTopicIcon(t.status);
    return <IconeTopico aria-hidden="true" />;
  })()}
  {isCurrent && (
    <span className="trail-check">
      <Check />
    </span>
  )}
</span>
<span className="trail-label">{t.name}</span>
                              </button>
                             {/* Botões de mover — ao lado do círculo, aparecem no hover */}
<div className="trail-step-arrows pointer-events-none absolute top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
  <button
    type="button"
    onClick={() => moveTopic(t.id, "up")}
    disabled={isFirst}
    className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    aria-label="Mover para cima"
  >
    <ChevronUp className="h-3.5 w-3.5" />
  </button>
  <button
    type="button"
    onClick={() => moveTopic(t.id, "down")}
    disabled={isLast}
    className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    aria-label="Mover para baixo"
  >
    <ChevronDown className="h-3.5 w-3.5" />
  </button>
</div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  );
                }
              )}
            </div>
          ) : (
            <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-white/10">
              <p className="text-sm text-foreground/40">Nenhum tópico criado. Clique em "Novo tópico" para começar.</p>
            </div>
          )}
        </AppShell>

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
                    className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                    disabled={isSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateTopic}
                    disabled={isSaving}
                    className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
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
  // DETALHE DO TÓPICO
  // ============================================================
  if (modo === "topico-detalhe" && selectedTopicId) {
    const topico = getTopicoById(selectedTopicId);
    if (!topico) {
      setModo("disciplina-detalhe");
      return null;
    }

    const disciplina = getDisciplinaById(topico.discipline_id);
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
          <div>
            <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">{disciplina?.name || "Disciplina"}</span>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{topico.name}</h1>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <select
              value={topico.status}
              onChange={(e) => handleUpdateTopicStatus(topico.id, e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground/70 outline-none focus:border-primary"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => handleDeleteTopic(selectedTopicId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/15"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
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
                      if (file) handleUploadFile(topico.id, file);
                      e.target.value = '';
                    }}
                    disabled={uploading}
                  />
                  <label
                    htmlFor={`file-upload-${topico.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {uploading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                    ) : (
                      <><Upload className="h-3.5 w-3.5" /> Enviar arquivo</>
                    )}
                  </label>
                </div>
              </header>

              {uploadError && (
                <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                  {uploadError}
                </div>
              )}

              {uploading && (
                <div className="mb-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(uploadProgress, 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-foreground/40">Enviando... {uploadProgress}%</p>
                </div>
              )}

              <ul className="mt-5 space-y-2">
                {currentFiles.length > 0 ? (
                  currentFiles.map((a) => {
                    const Icon = getIconByType(a.tipo);
                    const cor = getIconCor(a.tipo);
                    const isPdf = ehPdf(a);
                    const isCached = isPdf && cachedFileIds.has(a.id);
                    const filePath = resolveStoragePath(a);
                    return (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
                        <div className={`grid h-9 w-9 place-items-center rounded-md ${cor}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <div className="truncate text-sm font-medium">{a.nome}</div>
                            {isCached && (
                              <span
                                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"
                                title="Disponível offline neste dispositivo"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Offline
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-foreground/45">
                            {a.tipo} · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {isPdf && (
                            <button
                              type="button"
                              onClick={() => handleToggleOffline(a)}
                              className={[
                                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                                isCached
                                  ? "text-emerald-600 hover:bg-emerald-500/10"
                                  : "text-foreground/40 hover:bg-surface-2 hover:text-foreground",
                              ].join(" ")}
                              title={isCached ? "Remover cópia offline" : "Baixar cópia offline"}
                            >
                              {isCached ? (
                                <HardDriveDownload className="h-3.5 w-3.5" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {isPdf ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/pdf/${a.id}`)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15 transition-colors"
                              title="Abrir no leitor"
                            >
                              <BookOpenCheck className="h-3.5 w-3.5" /> Abrir
                            </button>
                          ) : (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-7 w-7 place-items-center rounded-md text-primary/70 hover:text-primary transition-colors"
                              title="Abrir em nova aba"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleRemoveFile(a.id, filePath, topico.id)}
                            disabled={isDeleting}
                            className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                            title="Remover arquivo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="py-4 text-center text-xs text-foreground/40">Nenhum material anexado ainda.</li>
                )}
              </ul>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rf-card p-5">
              <header className="mb-3 text-xs font-medium uppercase tracking-widest text-foreground/40">Progresso</header>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {topico.status === "dominado" ? "100%" : topico.status === "revisado" ? "75%" : topico.status === "estudando" ? "50%" : "0%"}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{
                  width: topico.status === "dominado" ? "100%" : topico.status === "revisado" ? "75%" : topico.status === "estudando" ? "50%" : "0%"
                }} />
              </div>
              <ul className="mt-4 space-y-2 text-xs">
                <Row k="Próxima revisão" v={proximaRevisao ? new Date(proximaRevisao.nextReviewDate).toLocaleDateString('pt-BR') : "—"} />
              </ul>
            </div>

            {revisoesTopico.length > 0 && (
              <div className="rf-card p-5">
                <header className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-foreground/40">
                  <Clock className="h-3 w-3 text-primary" /> Revisões programadas
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
                            {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-foreground/40" />}
                            <span className={isCompleted ? "text-foreground/50 line-through" : "text-foreground/85"}>{label}</span>
                          </span>
                          <span className={isCompleted ? "text-foreground/40" : "text-foreground/70"}>
                            {isCompleted ? "Concluída" : new Date(rev.nextReviewDate).toLocaleDateString('pt-BR')}
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

function Mini({ l, v, icon, tone }: { l: string; v: React.ReactNode; icon?: React.ReactNode; tone?: "accent" }) {
  return (
    <div className="rf-card p-4">
      {icon && <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>}
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