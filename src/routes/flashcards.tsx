import { useState, useCallback, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import { 
  Plus, RotateCw, ChevronLeft, Layers, Sparkles, Trash2, Edit, 
  CheckCircle, Search, Filter, Pencil, X, Bold, Italic, List,
  History, AlertTriangle, Loader2, Clock, TrendingUp, BarChart, BarChart3,
  Users, UserPlus, UserMinus, UserCheck, Settings, Flame, Calendar,
  ChevronDown, ChevronUp, Zap, Droplet, CalendarDays, Library,
  Tag, FolderTree, ArrowRightLeft
} from "lucide-react";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import type { Rating } from "@/lib/fsrs/types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { findUserByEmail, findUsersByIds } from "@/services/clerkService";
import { useNavigate } from "react-router-dom";
import { useConfirm } from "@/components/ConfirmDialog";
import { DeckPile } from "@/components/flashcards/DeckPile";
import { StudyCard } from "@/components/flashcards/StudyCard";
import { RfModal, StatTile } from "@/components/flashcards/RfModal";

// ============================================================
// 🔥 FUNÇÃO PARA RENDERIZAR TEXTO COM FORMATAÇÃO
// ============================================================
function renderFormattedText(text: string): string {
  if (!text) return '';
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^-\s(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  return html;
}

function FormattedText({ text, className }: { text: string; className?: string }) {
  const html = renderFormattedText(text);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function FlashcardsPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const flashcardContext = useFlashcardContext();
  const { 
    decks, 
    dueCards, 
    stats, 
    reviewCard, 
    refreshFlashcards,
    createDeck,
    addCard,
    deleteDeck,
    deleteCard,
    renameDeck,
    editCard,
    getDeckMeta,
    setDeckMeta,
    getCardMeta,
    setCardMeta,
    getCardHistory,
    getAllCardsByDeck,
    getAllFlashcards,
    addMemberToDeck,
    removeMemberFromDeck,
    addMemberByEmail,
    getDailyStudyCards,
    getCardsReviewedToday,
    getHardestCards,
    getHardestCardsToday,
    calculatePriority,
    getIsLeech,
    dailyLimit,
    settings,
  } = flashcardContext;

  // ============================================================
  // ESTADOS PRINCIPAIS
  // ============================================================
  const [modo, setModo] = useState<"decks" | "estudo" | "concluido">("decks");
  const [virado, setVirado] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [sessaoCards, setSessaoCards] = useState<any[]>([]);
  
  const [sessionStats, setSessionStats] = useState<{ 
    again: number; 
    hard: number; 
    good: number; 
    easy: number; 
    novos: number;
    total: number;
  } | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [editFromStudy, setEditFromStudy] = useState(false);

  // ============================================================
  // ESTADOS DOS MODAIS
  // ============================================================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [newMemberId, setNewMemberId] = useState("");
  const [isManagingMember, setIsManagingMember] = useState(false);
  
  const [isHardestModalOpen, setIsHardestModalOpen] = useState(false);
  const [hardestTab, setHardestTab] = useState<"geral" | "hoje">("hoje");

  const [membersInfo, setMembersInfo] = useState<Record<string, { name: string; email: string }>>({});
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [copyProgress, setCopyProgress] = useState<{ current: number; total: number } | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Deck form
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [deckDisciplina, setDeckDisciplina] = useState("");
  const [deckCor, setDeckCor] = useState("#FE7802");
  const [isShared, setIsShared] = useState(false);
  const [sharedWithInput, setSharedWithInput] = useState("");
  
  // Card form
  const [newCardFrente, setNewCardFrente] = useState("");
  const [newCardVerso, setNewCardVerso] = useState("");
  const [newCardTopico, setNewCardTopico] = useState("");
  
  // Edit form
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [editFrente, setEditFrente] = useState("");
  const [editVerso, setEditVerso] = useState("");
  const [editTopico, setEditTopico] = useState("");
  
  // Rename form
  const [renameName, setRenameName] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Lista de cards
  const [filterStatus, setFilterStatus] = useState<"todos" | "para_revisar">("todos");
  const [allCardsInDeck, setAllCardsInDeck] = useState<any[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  
  // 🔥 ESTADO PARA PESQUISA
  const [searchTerm, setSearchTerm] = useState("");

  // 🔥 ESTADO PARA MOSTRAR/OCULTAR O GRÁFICO
  const [showChart, setShowChart] = useState(false);

  // 🔥 ESTADOS DOS SUB-BARALHOS
  const [filtroTopico, setFiltroTopico] = useState<string | null>(null);
  const [isSubBaralhosModalOpen, setIsSubBaralhosModalOpen] = useState(false);
  const [editandoSub, setEditandoSub] = useState<string | null>(null);
  const [nomeNovoSub, setNomeNovoSub] = useState("");
  const [topicoEstudoAtivo, setTopicoEstudoAtivo] = useState<string | null>(null);

  // Refs
  const editFrenteRef = useRef<HTMLTextAreaElement>(null);
  const editVersoRef = useRef<HTMLTextAreaElement>(null);
  const newFrenteRef = useRef<HTMLTextAreaElement>(null);
  const newVersoRef = useRef<HTMLTextAreaElement>(null);

  // ============================================================
  // CARREGAR TODOS OS CARDS AO ABRIR UM DECK
  // ============================================================
  useEffect(() => {
    if (!selectedDeckId) {
      setAllCardsInDeck([]);
      setSearchTerm("");
      return;
    }
    const loadAllCards = async () => {
      setLoadingCards(true);
      try {
        const cards = await getAllCardsByDeck(selectedDeckId);
        setAllCardsInDeck(cards);
      } catch (error) {
        console.error('Erro ao carregar cards:', error);
        setErrorMessage('Erro ao carregar cards');
      } finally {
        setLoadingCards(false);
      }
    };
    loadAllCards();
  }, [selectedDeckId, getAllCardsByDeck]);

  // ============================================================
  // CARREGAR INFORMAÇÕES DOS MEMBROS
  // ============================================================
  useEffect(() => {
    if (isMembersModalOpen && selectedDeckId) {
      const deck = decks.find(d => d.id === selectedDeckId);
      if (deck) {
        const allMemberIds = [deck.owner_id, ...deck.shared_with];
        if (allMemberIds.length > 0) {
          setLoadingMembers(true);
          findUsersByIds(allMemberIds)
            .then(users => {
              const infoMap: Record<string, { name: string; email: string }> = {};
              users.forEach(user => {
                infoMap[user.id] = { 
                  name: user.name || user.id, 
                  email: user.email || '' 
                };
              });
              setMembersInfo(infoMap);
            })
            .catch(error => console.error('Erro ao buscar membros:', error))
            .finally(() => setLoadingMembers(false));
        }
      }
    }
  }, [isMembersModalOpen, selectedDeckId, decks]);

  // ============================================================
  // FILTRAR CARDS (STATUS + SUB-BARALHO + PESQUISA)
  // ============================================================
  const deckCards = useMemo(() => {
    let filtered = allCardsInDeck;
    if (filterStatus === "para_revisar") {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      filtered = allCardsInDeck.filter(c => {
        const due = new Date(c.dueDate);
        due.setHours(0, 0, 0, 0);
        return c.reps === 0 || due <= hoje;
      });
    }

    if (filtroTopico !== null) {
      if (filtroTopico === "__sem_topico__") {
        filtered = filtered.filter(c => !c.topico || !c.topico.trim());
      } else {
        filtered = filtered.filter(c => (c.topico || "").trim() === filtroTopico);
      }
    }

    if (searchTerm.trim() !== "") {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(c =>
        c.front.toLowerCase().includes(term) ||
        c.back.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [allCardsInDeck, filterStatus, searchTerm, filtroTopico]);

  // ============================================================
  // 🔥 LISTA DE SUB-BARALHOS DO BARALHO ABERTO
  // ============================================================
  const subBaralhosDoDeck = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const c of allCardsInDeck) {
      const t = (c.topico || "").trim();
      if (!t) continue;
      mapa.set(t, (mapa.get(t) || 0) + 1);
    }
    const semTopico = allCardsInDeck.filter(c => !c.topico || !c.topico.trim()).length;
    const lista = Array.from(mapa.entries())
      .map(([nome, count]) => ({ nome, count }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return { lista, semTopico };
  }, [allCardsInDeck]);

  // ============================================================
  // ESTATÍSTICAS DOS DECKS
  // ============================================================
  const getDeckStats = useCallback((deckId: string) => {
    const allFlashcards = getAllFlashcards();
    const cards = allFlashcards.filter((c) => c.deck_id === deckId);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const due = cards.filter(c => {
      const dueDate = new Date(c.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return c.reps === 0 || dueDate <= hoje;
    });
    return {
      total: cards.length,
      due: due.length,
      novos: cards.filter(c => c.reps === 0).length,
    };
  }, [getAllFlashcards]);

  // ============================================================
  // DADOS DO GRÁFICO
  // ============================================================
  const getStabilityOverTime = useCallback((deckId: string) => {
    const allFlashcards = getAllFlashcards();
    const cards = allFlashcards.filter(c => c.deck_id === deckId);
    if (cards.length === 0) return [];
    
    const grouped: Record<string, { total: number; sum: number; count: number }> = {};
    cards.forEach(c => {
      const date = new Date(c.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) {
        grouped[key] = { total: 0, sum: 0, count: 0 };
      }
      grouped[key].sum += c.stability || 0;
      grouped[key].count += 1;
    });
    
    const sortedKeys = Object.keys(grouped).sort();
    return sortedKeys.map(key => {
      const data = grouped[key];
      const avgStability = data.count > 0 ? data.sum / data.count : 0;
      const [year, month] = key.split('-');
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      return {
        month: `${monthNames[parseInt(month) - 1]}/${year.slice(2)}`,
        stability: Math.round(avgStability * 10) / 10,
        count: data.count,
      };
    });
  }, [getAllFlashcards]);

  const getStatusBadge = (reps: number, dueDate?: string) => {
    if (reps === 0) return { label: "Novo", className: "bg-primary/15 text-primary" };
    if (dueDate) {
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (due <= hoje) return { label: "Para revisar", className: "bg-accent/10 text-accent" };
    }
    return { label: "Revisado", className: "bg-white/5 text-foreground/55" };
  };

  // ============================================================
  // FORMATAÇÃO
  // ============================================================
  const applyFormatting = (
    ref: React.RefObject<HTMLTextAreaElement>, 
    format: 'bold' | 'italic' | 'list',
    setter: (value: string) => void
  ) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let newText = '';
    if (format === 'bold') {
      newText = `**${selectedText}**`;
    } else if (format === 'italic') {
      newText = `*${selectedText}*`;
    } else if (format === 'list') {
      newText = selectedText.split('\n').map(line => `- ${line}`).join('\n');
    }
    const newValue = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
    setter(newValue);
    setTimeout(() => {
      textarea.focus();
      const newCursor = start + newText.length;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 10);
  };

  // ============================================================
  // CRUD
  // ============================================================
  const handleCreateDeck = useCallback(async () => {
    if (!deckName.trim()) {
      setErrorMessage("Digite um nome para o baralho");
      return;
    }
    let sharedWithArray: string[] = [];
    if (isShared) {
      sharedWithArray = sharedWithInput
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
      if (sharedWithArray.length === 0) {
        setErrorMessage("Para compartilhar, digite pelo menos um user_id.");
        return;
      }
    }
    try {
      setIsSaving(true);
      setErrorMessage("");
      await createDeck(
        deckName.trim(),
        deckDescription.trim(),
        deckCor,
        isShared,
        sharedWithArray
      );
      const newDeck = decks.find(d => d.name === deckName.trim());
      if (newDeck) {
        setDeckMeta(newDeck.id, { disciplina: deckDisciplina });
      }
      setDeckName("");
      setDeckDescription("");
      setDeckDisciplina("");
      setDeckCor("#FE7802");
      setIsShared(false);
      setSharedWithInput("");
      setIsModalOpen(false);
      setErrorMessage("");
    } catch (error: any) {
      console.error("❌ Erro ao criar baralho:", error);
      setErrorMessage("Erro ao criar baralho: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [deckName, deckDescription, deckDisciplina, deckCor, isShared, sharedWithInput, createDeck, setDeckMeta, decks]);

  const handleAddCard = useCallback(async (keepOpen: boolean = false) => {
    if (!selectedDeckId) {
      setErrorMessage("Selecione um baralho primeiro");
      return;
    }
    if (!newCardFrente.trim() || !newCardVerso.trim()) {
      setErrorMessage("Preencha a pergunta e a resposta");
      return;
    }
    try {
      setIsSaving(true);
      const meta = newCardTopico.trim() ? { topico: newCardTopico.trim() } : undefined;
      await addCard(selectedDeckId, newCardFrente.trim(), newCardVerso.trim(), meta);
      setNewCardFrente("");
      setNewCardVerso("");
      setNewCardTopico("");
      if (!keepOpen) {
        setIsAddCardModalOpen(false);
      }
      setErrorMessage("");
      refreshFlashcards();
      const updatedCards = await getAllCardsByDeck(selectedDeckId);
      setAllCardsInDeck(updatedCards);
    } catch (error: any) {
      console.error("❌ Erro ao adicionar flashcard:", error);
      setErrorMessage("Erro ao adicionar flashcard: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [selectedDeckId, newCardFrente, newCardVerso, newCardTopico, addCard, refreshFlashcards, getAllCardsByDeck]);

  const handleEditCard = useCallback(async () => {
    if (!editCardId) return;
    if (!editFrente.trim() || !editVerso.trim()) {
      setErrorMessage("Preencha a pergunta e a resposta");
      return;
    }
    try {
      setIsSaving(true);
      const meta = { topico: editTopico.trim() };
      await editCard(editCardId, editFrente.trim(), editVerso.trim(), meta);
      if (editFromStudy) {
        setSessaoCards(prev => prev.map(card => 
          card.id === editCardId 
            ? { ...card, front: editFrente.trim(), back: editVerso.trim(), topico: editTopico.trim() || undefined }
            : card
        ));
        setEditFromStudy(false);
      }
      setIsEditModalOpen(false);
      setEditCardId(null);
      setEditFrente("");
      setEditVerso("");
      setEditTopico("");
      setErrorMessage("");
      refreshFlashcards();
      if (selectedDeckId) {
        const updatedCards = await getAllCardsByDeck(selectedDeckId);
        setAllCardsInDeck(updatedCards);
      }
    } catch (error: any) {
      console.error("❌ Erro ao editar card:", error);
      setErrorMessage("Erro ao editar card: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  }, [editCardId, editFrente, editVerso, editTopico, editCard, refreshFlashcards, selectedDeckId, getAllCardsByDeck, editFromStudy]);

  const handleDeleteDeck = useCallback(async (deckId: string) => {
    const ok = await confirmDialog({
      title: "Excluir este deck?",
      description: "Todos os cards serão removidos. Essa ação não pode ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDeck(deckId);
      if (selectedDeckId === deckId) {
        setSelectedDeckId(null);
        setModo("decks");
      }
    } catch (error: any) {
      console.error("❌ Erro ao deletar baralho:", error);
      setErrorMessage("Erro ao deletar baralho: " + (error.message || "Erro desconhecido"));
    }
  }, [selectedDeckId, deleteDeck, confirmDialog]);

  const handleDeleteCard = useCallback(async (cardId: string): Promise<boolean> => {
    const ok = await confirmDialog({
      title: "Excluir este flashcard?",
      description: "O card será removido do baralho. Essa ação não pode ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return false;
    try {
      await deleteCard(cardId);
      if (selectedDeckId) {
        const updatedCards = await getAllCardsByDeck(selectedDeckId);
        setAllCardsInDeck(updatedCards);
      }
      if (modo === "estudo") {
        setSessaoCards(prev => prev.filter(c => c.id !== cardId));
        if (sessaoCards.length === 1) {
          setModo("concluido");
        }
      }
      return true;
    } catch (error: any) {
      console.error("❌ Erro ao deletar flashcard:", error);
      setErrorMessage("Erro ao deletar flashcard: " + (error.message || "Erro desconhecido"));
      return false;
    }
  }, [deleteCard, selectedDeckId, getAllCardsByDeck, modo, sessaoCards.length, confirmDialog]);

  const handleRenameDeck = useCallback(async () => {
    if (!selectedDeckId || !renameName.trim()) {
      setErrorMessage("Digite um nome para o baralho");
      return;
    }
    try {
      setIsRenaming(true);
      setErrorMessage("");
      const deck = decks.find(d => d.id === selectedDeckId);
      const currentColor = deck?.color || "#FE7802";
      await renameDeck(selectedDeckId, renameName.trim(), renameDescription.trim(), currentColor);
      if (deckDisciplina.trim()) {
        setDeckMeta(selectedDeckId, { disciplina: deckDisciplina.trim() });
      }
      setIsRenameModalOpen(false);
      setRenameName("");
      setRenameDescription("");
      setDeckDisciplina("");
      setErrorMessage("✅ Baralho renomeado com sucesso!");
      setTimeout(() => setErrorMessage(""), 3000);
    } catch (error: any) {
      console.error("❌ Erro ao renomear baralho:", error);
      setErrorMessage("Erro ao renomear baralho: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsRenaming(false);
    }
  }, [selectedDeckId, renameName, renameDescription, deckDisciplina, renameDeck, decks, setDeckMeta]);

  // ============================================================
  // GERENCIAR MEMBROS
  // ============================================================
  const handleAddMember = useCallback(async () => {
    if (!selectedDeckId) return;
    if (!newMemberId.trim()) {
      setErrorMessage("Digite um e-mail válido");
      return;
    }
    try {
      setIsManagingMember(true);
      setCopyProgress(null);
      setErrorMessage("");
      const foundUserId = await findUserByEmail(newMemberId.trim());
      if (!foundUserId) {
        throw new Error(`Nenhum usuário encontrado com o e-mail: ${newMemberId.trim()}`);
      }
      await addMemberToDeck(
        selectedDeckId, 
        foundUserId, 
        (current: number, total: number) => {
          if (total === 0) {
            setCopyProgress(null);
          } else {
            setCopyProgress({ current, total });
          }
        }
      );
      setNewMemberId("");
      refreshFlashcards();
      const deck = decks.find(d => d.id === selectedDeckId);
      if (deck) {
        const allMemberIds = [deck.owner_id, ...deck.shared_with];
        if (allMemberIds.length > 0) {
          const users = await findUsersByIds(allMemberIds);
          const infoMap: Record<string, { name: string; email: string }> = {};
          users.forEach(user => {
            infoMap[user.id] = { 
              name: user.name || user.id, 
              email: user.email || '' 
            };
          });
          setMembersInfo(infoMap);
        }
      }
      setErrorMessage("✅ Membro adicionado com sucesso!");
      setTimeout(() => setErrorMessage(""), 3000);
    } catch (error: any) {
      console.error("❌ Erro ao adicionar membro:", error);
      setErrorMessage("Erro: " + (error.message || "Não foi possível adicionar"));
    } finally {
      setIsManagingMember(false);
      setCopyProgress(null);
    }
  }, [selectedDeckId, newMemberId, addMemberToDeck, refreshFlashcards, decks]);

  const handleRemoveMember = useCallback(async (userIdToRemove: string) => {
    if (!selectedDeckId) return;
    const ok = await confirmDialog({
      title: "Remover este membro?",
      description: "A pessoa perderá o acesso a este baralho.",
      confirmText: "Remover",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    try {
      setIsManagingMember(true);
      await removeMemberFromDeck(selectedDeckId, userIdToRemove);
      refreshFlashcards();
      const deck = decks.find(d => d.id === selectedDeckId);
      if (deck) {
        const allMemberIds = [deck.owner_id, ...deck.shared_with];
        if (allMemberIds.length > 0) {
          const users = await findUsersByIds(allMemberIds);
          const infoMap: Record<string, { name: string; email: string }> = {};
          users.forEach(user => {
            infoMap[user.id] = { 
              name: user.name || user.id, 
              email: user.email || '' 
            };
          });
          setMembersInfo(infoMap);
        } else {
          setMembersInfo({});
        }
      }
      setErrorMessage("✅ Membro removido com sucesso!");
      setTimeout(() => setErrorMessage(""), 3000);
    } catch (error: any) {
      console.error("❌ Erro ao remover membro:", error);
      setErrorMessage("Erro: " + (error.message || "Não foi possível remover"));
    } finally {
      setIsManagingMember(false);
    }
  }, [selectedDeckId, removeMemberFromDeck, refreshFlashcards, decks, confirmDialog]);

  // ============================================================
  // INICIAR ESTUDO (agora aceita sub-baralho)
  // ============================================================
  const iniciarEstudo = useCallback(async (deckId?: string, topico?: string) => {
    if (isStarting) return;
    setIsStarting(true);
    setErrorMessage("");
    try {
      const cards = await getDailyStudyCards(deckId, topico);
      
      if (cards.length === 0) {
        const reviewedToday = getCardsReviewedToday();
        if (reviewedToday >= (settings?.daily_limit || 100)) {
          setErrorMessage(`🎉 Limite diário atingido (${reviewedToday}/${settings?.daily_limit || 100})! Volte amanhã.`);
        } else {
          setErrorMessage("🎉 Nenhum flashcard para revisar hoje!");
        }
        setTimeout(() => setErrorMessage(""), 4000);
        setIsStarting(false);
        return;
      }

      setSessaoCards(cards);
      setSessionStats({
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
        novos: cards.filter(c => c.reps === 0).length,
        total: cards.length,
      });
      setSessionStartTime(new Date());
      if (deckId) {
        setSelectedDeckId(deckId);
      } else {
        setSelectedDeckId(null);
      }
      setCurrentCardIndex(0);
      setTopicoEstudoAtivo(topico || null);
      setVirado(false);
      setModo("estudo");
    } catch (error) {
      console.error("Erro ao iniciar estudo:", error);
      setErrorMessage("Erro ao iniciar estudo: " + (error instanceof Error ? error.message : ""));
    } finally {
      setIsStarting(false);
    }
  }, [getDailyStudyCards, getCardsReviewedToday, settings, isStarting]);

  // ============================================================
  // AVALIAÇÃO
  // ============================================================
  const handleRating = useCallback(async (rating: Rating) => {
    if (isRating) return;
    const currentCard = sessaoCards[currentCardIndex];
    if (!currentCard) return;
    
    setIsRating(true);
    try {
      const result = await reviewCard(currentCard.id, rating);
      if (result) {
        setSessionStats(prev => {
          if (!prev) return prev;
          const newStats = { ...prev };
          if (rating === 'again') newStats.again += 1;
          else if (rating === 'hard') newStats.hard += 1;
          else if (rating === 'good') newStats.good += 1;
          else if (rating === 'easy') newStats.easy += 1;
          return newStats;
        });
        
        if (currentCardIndex < sessaoCards.length - 1) {
          setCurrentCardIndex((prev) => prev + 1);
          setVirado(false);
        } else {
          setModo("concluido");
          setVirado(false);
        }
      }
    } catch (error) {
      console.error("Erro ao avaliar card:", error);
    } finally {
      setIsRating(false);
    }
  }, [isRating, sessaoCards, currentCardIndex, reviewCard]);

  // ============================================================
  // VOLTAR
  // ============================================================
  const voltarDaConclusao = useCallback(async () => {
    setModo("decks");
    setSelectedDeckId(null);
    setCurrentCardIndex(0);
    setVirado(false);
    setSessaoCards([]);
    setSessionStats(null);
    setSessionStartTime(null);
    setTopicoEstudoAtivo(null);
    refreshFlashcards();
  }, [refreshFlashcards]);

  const voltarParaDecks = useCallback(() => {
    setSelectedDeckId(null);
    setModo("decks");
    setSessaoCards([]);
    setSessionStats(null);
    setSessionStartTime(null);
    setSearchTerm("");
    setShowChart(false);
    setFiltroTopico(null);
    setTopicoEstudoAtivo(null);
  }, []);

  const openEditFromStudy = useCallback((card: any) => {
    const meta = getCardMeta(card.id);
    setEditCardId(card.id);
    setEditFrente(card.front);
    setEditVerso(card.back);
    setEditTopico(card.topico || meta.topico || "");
    setEditFromStudy(true);
    setIsEditModalOpen(true);
  }, [getCardMeta]);

  const openEditModal = useCallback((card: any) => {
    const meta = getCardMeta(card.id);
    setEditCardId(card.id);
    setEditFrente(card.front);
    setEditVerso(card.back);
    setEditTopico(card.topico || meta.topico || "");
    setEditFromStudy(false);
    setIsEditModalOpen(true);
  }, [getCardMeta]);

  // ============================================================
  // RENDERIZAÇÃO
  // ============================================================
  let conteudo = null;

  if (modo === "estudo") {
    const currentCard = sessaoCards[currentCardIndex] || null;
    const deck = decks?.find((d) => d.id === selectedDeckId);

    if (currentCard) {
      const isLeech = getIsLeech(currentCard);
      const nextReviewTime = settings?.show_next_review_time 
        ? new Date(currentCard.dueDate).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

      conteudo = (
        <AppShell breadcrumb="Flashcards · Estudo">
          <button
            onClick={() => { 
              setModo("decks"); 
              setVirado(false); 
              setSelectedDeckId(null); 
              setCurrentCardIndex(0); 
              setSessaoCards([]);
              setSessionStats(null);
              setSessionStartTime(null);
              setTopicoEstudoAtivo(null);
            }}
            className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar aos decks
          </button>
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-widest text-primary">
                {selectedDeckId ? deck?.name || "Estudo" : "Estudo de Hoje"}
                {topicoEstudoAtivo && topicoEstudoAtivo !== "__sem_topico__" && (
                  <span className="ml-2 text-foreground/60">· {topicoEstudoAtivo}</span>
                )}
                {topicoEstudoAtivo === "__sem_topico__" && (
                  <span className="ml-2 text-foreground/60">· Sem sub-baralho</span>
                )}
                {isLeech && <span className="ml-2 text-accent">🩸 Sanguessuga</span>}
              </span>
              <span className="tabular-nums text-foreground/50">Card {currentCardIndex + 1} de {sessaoCards.length}</span>
            </div>
            <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((currentCardIndex + 1) / sessaoCards.length) * 100}%` }} />
            </div>
            
            <div className="flex justify-end mb-2 gap-2">
              <button
                onClick={() => openEditFromStudy(currentCard)}
                className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <Edit className="h-3.5 w-3.5" /> Editar card
              </button>
            </div>
            <StudyCard
              front={<FormattedText text={currentCard.front} />}
              back={
                <>
                  <FormattedText text={currentCard.back} />
                  {nextReviewTime && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      ⏳ Próxima revisão: {nextReviewTime}
                    </p>
                  )}
                </>
              }
              flipped={virado}
              onFlip={() => setVirado((v) => !v)}
              deckName={selectedDeckId ? deck?.name || "Estudo" : "Estudo de Hoje"}
              color={deck?.color || 'var(--primary)'}
              position={`${currentCardIndex + 1}/${sessaoCards.length}`}
            />
            {virado && (
              <div className="mt-6 grid grid-cols-4 gap-2 rf-fade-in">
                <FsrsButton label="Errei" hint="10 min" variant="again" onClick={() => handleRating("again")} disabled={isRating} />
                <FsrsButton label="Difícil" hint="2 dias" variant="hard" onClick={() => handleRating("hard")} disabled={isRating} />
                <FsrsButton label="Bom" hint="4 dias" variant="good" onClick={() => handleRating("good")} disabled={isRating} />
                <FsrsButton label="Fácil" hint="12 dias" variant="easy" onClick={() => handleRating("easy")} disabled={isRating} />
              </div>
            )}
            {!virado && (
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-foreground/40">
                <RotateCw className="h-3 w-3" /> Espaço para virar · 1/2/3/4 para avaliar
              </div>
            )}
          </div>
        </AppShell>
      );
    } else {
      setModo("concluido");
    }
  } else if (modo === "concluido") {
    const deck = decks?.find((d) => d.id === selectedDeckId);
    const stats = sessionStats;
    const duration = sessionStartTime 
      ? Math.round((new Date().getTime() - sessionStartTime.getTime()) / 1000 / 60) 
      : 0;
    
    conteudo = (
      <AppShell breadcrumb="Flashcards · Concluído">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rf-card p-8 sm:p-12">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-success/10 p-4">
                <CheckCircle className="h-12 w-12 text-success" />
              </div>
            </div>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">🎉 Revisão concluída!</h2>
            <p className="mt-2 text-sm text-foreground/55">
              Você revisou {sessaoCards.length} flashcards {selectedDeckId ? `do baralho ${deck?.name}` : "de hoje"}.
            </p>
            
            {stats && (
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <div className="rounded-lg bg-background/40 p-4">
                  <div className="text-2xl font-bold text-success">{stats.good + stats.easy}</div>
                  <div className="text-[10px] uppercase tracking-wider text-foreground/40">Acertos (Bom/Fácil)</div>
                </div>
                <div className="rounded-lg bg-background/40 p-4">
                  <div className="text-2xl font-bold text-accent">{stats.again + stats.hard}</div>
                  <div className="text-[10px] uppercase tracking-wider text-foreground/40">Erros (Errei/Difícil)</div>
                </div>
                <div className="rounded-lg bg-background/40 p-4">
                  <div className="text-2xl font-bold text-primary">{stats.novos}</div>
                  <div className="text-[10px] uppercase tracking-wider text-foreground/40">Novos cards</div>
                </div>
                <div className="rounded-lg bg-background/40 p-4">
                  <div className="text-2xl font-bold text-white">{duration}m</div>
                  <div className="text-[10px] uppercase tracking-wider text-foreground/40">Tempo total</div>
                </div>
              </div>
            )}
            
            <p className="mt-6 text-xs text-foreground/40">Excelente trabalho! Continue assim.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button onClick={voltarDaConclusao} className="btn-sun px-6 py-2.5 text-sm">Voltar para os decks</button>
              <button
                onClick={async () => {
                  if (selectedDeckId) {
                    setIsRestarting(true);
                    try {
                      await iniciarEstudo(selectedDeckId, topicoEstudoAtivo || undefined);
                    } catch (error) {
                      console.error(error);
                    } finally {
                      setIsRestarting(false);
                    }
                  } else {
                    setIsRestarting(true);
                    try {
                      await iniciarEstudo();
                    } catch (error) {
                      console.error(error);
                    } finally {
                      setIsRestarting(false);
                    }
                  }
                }}
                disabled={isRestarting}
                className="btn-ghost inline-flex items-center gap-2 px-6 py-2.5 text-sm disabled:opacity-50"
              >
                {isRestarting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Estudar novamente
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  } else if (selectedDeckId) {
    // ============================================================
    // MODO DECKS - VISUALIZAÇÃO DE UM DECK ESPECÍFICO
    // ============================================================
    const deck = decks.find(d => d.id === selectedDeckId);
    if (!deck) {
      setSelectedDeckId(null);
    } else {
      const deckStats = getDeckStats(selectedDeckId);
      const deckMeta = getDeckMeta(selectedDeckId);
      const isErrorDeck = deck.name === "Erros";
      const deckColor = deck.color || '#FE7802';
      const chartData = getStabilityOverTime(selectedDeckId);
      
      const currentUserId = localStorage.getItem('revisaflash_user_id') || '';
      const isOwner = (deck.owner_id === currentUserId) || (!deck.owner_id && deck.user_id === currentUserId);
      
      const todayCards = dueCards.filter(c => c.deck_id === selectedDeckId);
      
      conteudo = (
        <AppShell breadcrumb={`Flashcards · ${deck.name}`}>
          <button onClick={voltarParaDecks} className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar aos decks
          </button>
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
                style={{
                  backgroundColor: `${deckColor}40`,
                  color: deckColor,
                }}
              >
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">
                  {deckMeta.disciplina || "Baralho"}
                  {deck.is_shared && (
                    <span className="ml-2 inline-flex items-center gap-1 text-primary">
                      <Users className="h-3 w-3" /> Compartilhado
                    </span>
                  )}
                </span>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{deck.name}</h1>
                <p className="mt-1 text-sm text-foreground/55">{deck.description || "Sem descrição"}</p>
                {deck.is_shared && (
                  <p className="mt-1 text-xs text-foreground/40">
                    👥 {deck.shared_with.length + 1} membros (Dono + {deck.shared_with.length} convidadas)
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isOwner && (
                <button
                  onClick={() => {
                    setIsMembersModalOpen(true);
                    setErrorMessage("");
                  }}
                  className="rfm-btn rfm-btn--outline"
                  style={{ "--tone": "var(--primary)" } as CSSProperties}
                >
                  <Users className="h-4 w-4" /> Gerenciar membros
                </button>
              )}
              <button
                onClick={() => { 
                  setRenameName(deck.name); 
                  setRenameDescription(deck.description || ''); 
                  setDeckDisciplina(deckMeta.disciplina || '');
                  setIsRenameModalOpen(true); 
                }}
                className="btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              ><Pencil className="h-3.5 w-3.5" /> Editar baralho</button>
              <button
                onClick={() => { setIsAddCardModalOpen(true); setErrorMessage(''); }}
                className="btn-sun inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              ><Plus className="h-3.5 w-3.5" /> Novo flashcard</button>
            </div>
          </header>
          
          {chartData.length > 0 && (
            <div className="mb-6 rfm-stat">
              <button
                type="button"
                onClick={() => setShowChart(v => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="font-display text-sm font-bold text-foreground">Evolução da Estabilidade Média</span>
                  <span className="text-xs text-foreground/40">(por mês)</span>
                </span>
                <span className="rfm-meta shrink-0">
                  {showChart ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showChart ? "Ocultar" : "Mostrar"}
                </span>
              </button>
              {showChart && (
                <div className="mt-4 h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                      <YAxis 
                        domain={[0, 'auto']} 
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} 
                        label={{ value: 'Estabilidade', angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)', fontSize: 10 }}
                      />
                      <Tooltip 
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}
                        labelStyle={{ color: 'var(--foreground)' }}
                        formatter={(value: any) => [`${value}`, 'Estabilidade média']}
                      />
                      <Line type="monotone" dataKey="stability" stroke="var(--primary)" strokeWidth={2} dot={{ fill: 'var(--primary)', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-2 text-[10px] text-foreground/30">
                {chartData.length} {chartData.length === 1 ? "mês" : "meses"} de dados · Média geral: {(chartData.reduce((acc, d) => acc + d.stability, 0) / chartData.length).toFixed(1)}
              </p>
            </div>
          )}
          
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Cards" value={deckStats.total} />
            <StatTile label="Para revisar" value={deckStats.due} tone="var(--accent)" />
            <StatTile label="Novos" value={deckStats.novos} />
            <StatTile label="Maturidade" value={deckStats.total > 0 ? `${Math.round((deckStats.total - deckStats.novos) / deckStats.total * 100)}%` : '0%'} tone="var(--primary)" />
          </div>

          {/* ===== FILTROS: status + sub-baralho + buscar ===== */}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div role="tablist" className="rfm-tabs">
                <button
                  role="tab"
                  aria-selected={filterStatus === "todos"}
                  className="rfm-tab"
                  onClick={() => setFilterStatus("todos")}
                >
                  Todos
                </button>
                <button
                  role="tab"
                  aria-selected={filterStatus === "para_revisar"}
                  className="rfm-tab"
                  onClick={() => setFilterStatus("para_revisar")}
                >
                  Para revisar
                </button>
              </div>

              {/* Filtro de sub-baralho */}
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <select
                  value={filtroTopico ?? ""}
                  onChange={(e) => setFiltroTopico(e.target.value === "" ? null : e.target.value)}
                  className="bg-transparent text-xs font-medium outline-none text-foreground"
                >
                  <option value="">Todos os sub-baralhos</option>
                  {subBaralhosDoDeck.lista.map((s) => (
                    <option key={s.nome} value={s.nome}>
                      {s.nome} ({s.count})
                    </option>
                  ))}
                  {subBaralhosDoDeck.semTopico > 0 && (
                    <option value="__sem_topico__">
                      Sem sub-baralho ({subBaralhosDoDeck.semTopico})
                    </option>
                  )}
                </select>
              </div>

              {/* Botão gerenciar sub-baralhos */}
              <button
                type="button"
                onClick={() => setIsSubBaralhosModalOpen(true)}
                className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                title="Gerenciar sub-baralhos deste baralho"
              >
                <FolderTree className="h-3.5 w-3.5" /> Gerenciar sub-baralhos
              </button>

              {/* Botão estudar só o sub-baralho atual */}
              {filtroTopico !== null && deckCards.length > 0 && (
                <button
                  type="button"
                  onClick={() => iniciarEstudo(selectedDeckId, filtroTopico)}
                  disabled={isStarting}
                  className="btn-sun inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  {isStarting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />}
                  Estudar só {filtroTopico === "__sem_topico__" ? "Sem sub-baralho" : `"${filtroTopico}"`}
                </button>
              )}

              <span className="text-xs text-muted-foreground">
                {loadingCards ? "(carregando...)" : `${deckCards.length} cards`}
              </span>
            </div>

            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Buscar nesse baralho…"
                className="rfm-input w-full py-2 pl-9 sm:w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
          </div>

          {/* ===== GRADE DE CARDS ===== */}
          {loadingCards ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : deckCards.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deckCards.map((card, index) => {
                const status = getStatusBadge(card.reps, card.dueDate);
                const meta = getCardMeta(card.id);
                const isLeech = getIsLeech(card);
                const tone = isErrorDeck ? "var(--accent)" : deckColor;
                return (
                  <article
                    key={card.id}
                    className="rfm-fcard"
                    style={{ "--tone": tone } as CSSProperties}
                  >
                    <div className="rfm-fcard__head">
                      <span className="rfm-fcard__num">{index + 1}</span>
                      <div className="flex items-center gap-1.5">
                        {isLeech && <Droplet className="h-3 w-3 text-accent" />}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>
                      </div>
                    </div>
                    <div className="rfm-fcard__body">
                      <p className="rfm-fcard__q">
                        <FormattedText text={card.front} />
                      </p>
                      <p className="rfm-fcard__a">
                        <FormattedText text={card.back} />
                      </p>
                    </div>
                    <div className="rfm-fcard__foot">
                      <div className="flex min-w-0 flex-col gap-0.5 text-[10px] text-muted-foreground">
                        {(card.topico || meta.topico) && (
                          <span className="truncate text-primary">🏷 {card.topico || meta.topico}</span>
                        )}
                        <span className="flex gap-2">
                          <span>Erros: {card.lapses || 0}</span>
                          <span>Dif: {card.difficulty?.toFixed(1) || 0}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditModal(card)}
                          className="rfm-icon-btn"
                          aria-label="Editar card"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCard(card.id)}
                          className="rfm-icon-btn rfm-icon-btn--danger"
                          aria-label="Excluir card"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
              <p className="text-sm text-foreground/40">
                {filtroTopico !== null
                  ? "Nenhum card neste sub-baralho."
                  : filterStatus === "todos" 
                    ? "Nenhum flashcard neste baralho." 
                    : "Nenhum flashcard para revisar agora. Volte mais tarde!"}
              </p>
            </div>
          )}
        </AppShell>
      );
    }
  } else {
    // ============================================================
    // MODO PRINCIPAL (DECKS)
    // ============================================================
    const reviewedToday = getCardsReviewedToday();
    const remainingToday = Math.max(0, (settings?.daily_limit || 100) - reviewedToday);
    
    conteudo = (
      <AppShell breadcrumb="Flashcards" title="Decks">
        <div id="flashcards-header">
        {errorMessage && (
          <div className={`mb-4 rounded-xl border p-3 text-sm ${errorMessage.includes("🎉") || errorMessage.includes("✅") ? "border-success/20 bg-success/20 text-success" : "border-destructive/20 bg-destructive/20 text-destructive"}`}>
            {errorMessage}
          </div>
        )}
        <div className="-mt-4 mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="max-w-xl text-sm text-foreground/55">
              Algoritmo de repetição espaçada FSRS. Cards são apresentados no momento ideal para fixar o conteúdo.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/40">
              <span>📊 Limite diário: <strong className="text-foreground">{settings?.daily_limit || 100}</strong></span>
              <span>✅ Revisados hoje: <strong className="text-foreground">{reviewedToday}</strong></span>
              <span>🟢 Restantes: <strong className="text-foreground">{remainingToday}</strong></span>
              <button
                onClick={() => navigate('/configuracoes#flashcards')}
                className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" /> Alterar limites
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsHardestModalOpen(true)}
              className="rfm-btn rfm-btn--outline"
              style={{ "--tone": "var(--accent)" } as CSSProperties}
            >
              <Flame className="h-4 w-4" /> Cards difíceis
            </button>
            <button
              onClick={() => iniciarEstudo()}
              disabled={isStarting || remainingToday <= 0}
              className="btn-sun inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-30"
            >
              {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Estudar hoje
            </button>
            <button
              onClick={() => { setIsModalOpen(true); setErrorMessage(""); }}
              className="btn-ghost inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Novo baralho
            </button>
          </div>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Decks" value={decks?.length || 0} icon={<Layers className="h-4 w-4" />} />
          <StatTile label="Cards totais" value={stats.totalCards} icon={<Sparkles className="h-4 w-4" />} />
          <StatTile label="Para revisar" value={stats.dueCards} tone="var(--accent)" />
          <StatTile label="Novos" value={dueCards.filter(c => c.reps === 0).length} tone="var(--primary)" />
        </div>
        {decks && decks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((deck) => {
              const stats = getDeckStats(deck.id);
              const meta = getDeckMeta(deck.id);
              const deckColor = deck.color || '#FE7802';

              return (
                <DeckPile
                  key={deck.id}
                  name={deck.name}
                  description={
                    meta.disciplina
                      ? `${meta.disciplina}${deck.description ? ' · ' + deck.description : ''}`
                      : deck.description || "Sem descrição"
                  }
                  total={stats.total}
                  due={stats.due}
                  color={deckColor}
                  shared={deck.is_shared}
                  badge={deck.name === "Erros" ? <AlertTriangle className="h-4 w-4 text-accent" /> : undefined}
                  onOpen={() => setSelectedDeckId(deck.id)}
                  onStudy={() => iniciarEstudo(deck.id)}
                  studyDisabled={stats.due === 0 || isStarting || remainingToday <= 0}
                  studyLabel={isStarting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</> : undefined}
                  actions={
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeckId(deck.id);
                          setRenameName(deck.name);
                          setRenameDescription(deck.description || "");
                          setDeckDisciplina(meta.disciplina || '');
                          setIsRenameModalOpen(true);
                        }}
                        className="rfm-icon-btn"
                        aria-label="Editar baralho"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                        className="rfm-icon-btn rfm-icon-btn--danger"
                        aria-label="Excluir baralho"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
            <p className="text-sm text-foreground/40">Nenhum baralho criado. Clique em "Novo baralho" para começar.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
  }

  // ============================================================
  // MODAIS
  // ============================================================
  return (
    <>
      {conteudo}

      {/* MODAL: CRIAR BARALHO */}
      <RfModal
        open={isModalOpen}
        onClose={() => { setIsModalOpen(false); setDeckName(""); setDeckDescription(""); setDeckDisciplina(""); setDeckCor("#FE7802"); setIsShared(false); setSharedWithInput(""); setErrorMessage(""); }}
        title="Criar novo baralho"
        icon={<Layers className="h-4 w-4" />}
        tone={deckCor}
        width="40rem"
        footer={
          <>
            <button
              className="rfm-btn rfm-btn--ghost"
              onClick={() => { setIsModalOpen(false); setDeckName(""); setDeckDescription(""); setDeckDisciplina(""); setDeckCor("#FE7802"); setIsShared(false); setSharedWithInput(""); setErrorMessage(""); }}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateDeck}
              disabled={isSaving}
              className="btn-sun px-6 py-2.5 text-sm disabled:opacity-40"
            >
              {isSaving ? "Criando..." : "Criar baralho"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="rfm-label">Nome do baralho *</label>
            <input
              type="text"
              placeholder="Digite o nome do baralho"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="rfm-input"
            />
          </div>
          <div>
            <label className="rfm-label">Descrição</label>
            <textarea
              rows={2}
              placeholder="Descreva o conteúdo do baralho"
              value={deckDescription}
              onChange={(e) => setDeckDescription(e.target.value)}
              className="rfm-input"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="rfm-label">Disciplina</label>
              <input
                type="text"
                placeholder="Ex: Patologia Oral"
                value={deckDisciplina}
                onChange={(e) => setDeckDisciplina(e.target.value)}
                className="rfm-input"
              />
            </div>
            <div>
              <label className="rfm-label">Cor de destaque</label>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {["#FE7802", "#F43789", "#F59E0B", "#60A5FA", "#A78BFA", "#34D399", "#F472B6", "#FBBF24"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={deckCor === c}
                    aria-label={`Cor ${c}`}
                    onClick={() => setDeckCor(c)}
                    className="rfm-swatch"
                    style={{ "--sw": c } as CSSProperties}
                  />
                ))}
              </div>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <button
              type="button"
              role="switch"
              aria-checked={isShared}
              className="rfm-switch"
              onClick={() => setIsShared(!isShared)}
            />
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Compartilhar este baralho com amigas</span>
          </label>
          {isShared && (
            <div>
              <label className="rfm-label">IDs das convidadas (separados por vírgula)</label>
              <input
                type="text"
                placeholder="Ex: user_abc123, user_def456"
                value={sharedWithInput}
                onChange={(e) => setSharedWithInput(e.target.value)}
                className="rfm-input"
              />
              <p className="mt-1 text-[10px] text-foreground/40">
                💡 Digite o user_id de cada amiga. Elas verão os cards, mas com estatísticas próprias.
              </p>
            </div>
          )}
        </div>
      </RfModal>

      {/* MODAL: ADICIONAR FLASHCARD */}
      <RfModal
        open={isAddCardModalOpen}
        onClose={() => { setIsAddCardModalOpen(false); setNewCardFrente(""); setNewCardVerso(""); setNewCardTopico(""); setErrorMessage(""); }}
        title="Adicionar flashcard"
        icon={<Plus className="h-4 w-4" />}
        width="36rem"
        footer={
          <>
            <button
              className="rfm-btn rfm-btn--ghost"
              onClick={() => { setIsAddCardModalOpen(false); setNewCardFrente(""); setNewCardVerso(""); setNewCardTopico(""); setErrorMessage(""); }}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              onClick={() => handleAddCard(true)}
              disabled={isSaving}
              className="rfm-btn rfm-btn--outline"
              style={{ "--tone": "var(--primary)" } as CSSProperties}
            >
              {isSaving ? "Salvando..." : "Salvar e criar outro"}
            </button>
            <button
              onClick={() => handleAddCard(false)}
              disabled={isSaving}
              className="btn-sun px-5 py-2.5 text-sm disabled:opacity-40"
            >
              {isSaving ? "Salvando..." : "Salvar cartão"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rfm-face" style={{ "--tone": "var(--primary)" } as CSSProperties}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rfm-tag">Pergunta</span>
                <span className="text-xs text-foreground/45">Frente do cartão</span>
              </div>
              <div className="rfm-toolbar">
                <button type="button" onClick={() => applyFormatting(newFrenteRef, 'bold', setNewCardFrente)} aria-label="Negrito"><Bold className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(newFrenteRef, 'italic', setNewCardFrente)} aria-label="Itálico"><Italic className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(newFrenteRef, 'list', setNewCardFrente)} aria-label="Lista"><List className="h-3 w-3" /></button>
              </div>
            </div>
            <textarea
              ref={newFrenteRef}
              rows={4}
              placeholder="Digite a pergunta"
              value={newCardFrente}
              onChange={(e) => setNewCardFrente(e.target.value)}
              className="rfm-input font-display text-base"
            />
          </div>
          <div className="rfm-face" style={{ "--tone": "var(--accent)" } as CSSProperties}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rfm-tag">Resposta</span>
                <span className="text-xs text-foreground/45">Verso do cartão</span>
              </div>
              <div className="rfm-toolbar">
                <button type="button" onClick={() => applyFormatting(newVersoRef, 'bold', setNewCardVerso)} aria-label="Negrito"><Bold className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(newVersoRef, 'italic', setNewCardVerso)} aria-label="Itálico"><Italic className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(newVersoRef, 'list', setNewCardVerso)} aria-label="Lista"><List className="h-3 w-3" /></button>
              </div>
            </div>
            <textarea
              ref={newVersoRef}
              rows={5}
              placeholder="Digite a resposta"
              value={newCardVerso}
              onChange={(e) => setNewCardVerso(e.target.value)}
              className="rfm-input text-sm leading-relaxed"
            />
          </div>
          <div>
            <label className="rfm-label">Sub-baralho (Tópico)</label>
            <input
              type="text"
              placeholder="Ex: Osteologia, Arritmias..."
              value={newCardTopico}
              onChange={(e) => setNewCardTopico(e.target.value)}
              className="rfm-input"
              list="sub-baralhos-existentes"
            />
            <datalist id="sub-baralhos-existentes">
              {subBaralhosDoDeck.lista.map((s) => (
                <option key={s.nome} value={s.nome} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-foreground/40">
              💡 Digite o nome do sub-baralho. Se já existir, ele é reaproveitado.
            </p>
          </div>
        </div>
      </RfModal>

      {/* MODAL: RENOMEAR BARALHO */}
      <RfModal
        open={isRenameModalOpen}
        onClose={() => { setIsRenameModalOpen(false); setRenameName(""); setRenameDescription(""); setDeckDisciplina(""); setErrorMessage(""); }}
        title="Renomear baralho"
        icon={<Pencil className="h-4 w-4" />}
        width="26rem"
        footer={
          <>
            <button
              className="rfm-btn rfm-btn--ghost"
              onClick={() => { setIsRenameModalOpen(false); setRenameName(""); setRenameDescription(""); setDeckDisciplina(""); setErrorMessage(""); }}
              disabled={isRenaming}
            >
              Cancelar
            </button>
            <button
              onClick={handleRenameDeck}
              disabled={isRenaming}
              className="btn-sun px-8 py-2.5 text-sm disabled:opacity-40"
            >
              {isRenaming ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="rfm-label">Nome</label>
            <input
              type="text"
              placeholder="Novo nome do baralho"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              className="rfm-input"
            />
          </div>
          <div>
            <label className="rfm-label">Descrição</label>
            <input
              type="text"
              placeholder="Nova descrição (opcional)"
              value={renameDescription}
              onChange={(e) => setRenameDescription(e.target.value)}
              className="rfm-input"
            />
          </div>
          <div>
            <label className="rfm-label">Disciplina</label>
            <input
              type="text"
              placeholder="Disciplina (opcional)"
              value={deckDisciplina}
              onChange={(e) => setDeckDisciplina(e.target.value)}
              className="rfm-input"
            />
          </div>
        </div>
      </RfModal>

      {/* MODAL: EDITAR FLASHCARD */}
      <RfModal
        open={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setEditCardId(null); setEditFrente(""); setEditVerso(""); setEditTopico(""); setErrorMessage(""); }}
        title="Editar flashcard"
        icon={<Pencil className="h-4 w-4" />}
        width="36rem"
        footer={
          <>
            <button
              className="rfm-btn rfm-btn--ghost"
              onClick={() => { setIsEditModalOpen(false); setEditCardId(null); setEditFrente(""); setEditVerso(""); setEditTopico(""); setErrorMessage(""); }}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              onClick={handleEditCard}
              disabled={isSaving}
              className="btn-sun px-5 py-2.5 text-sm disabled:opacity-40"
            >
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </button>
          </>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-foreground/55">
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-medium">Card #{editCardId ? editCardId.slice(-3) : '--'}</span>
            <span>·</span>
            <span>{decks.find(d => d.id === selectedDeckId)?.name || "Baralho"}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-primary">
              <Sparkles className="h-3 w-3" /> 
              {(() => {
                const card = dueCards.find(c => c.id === editCardId);
                if (!card) return '0%';
                const total = dueCards.filter(c => c.deck_id === selectedDeckId).length;
                if (total === 0) return '0%';
                const maturidade = Math.round(((total - (card.reps === 0 ? 1 : 0)) / total) * 100);
                return `${maturidade}%`;
              })()}
            </span>
          </div>
          <button
            onClick={async () => {
              if (!editCardId) return;
              const deleted = await handleDeleteCard(editCardId);
              if (deleted) {
                setIsEditModalOpen(false);
                setEditCardId(null);
                setEditFrente("");
                setEditVerso("");
                setEditTopico("");
              }
            }}
            className="rfm-btn rfm-btn--outline"
            style={{ "--tone": "var(--destructive)" } as CSSProperties}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir cartão
          </button>
        </div>
        <div className="space-y-4">
          <div className="rfm-face" style={{ "--tone": "var(--primary)" } as CSSProperties}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rfm-tag">Pergunta</span>
                <span className="text-xs text-foreground/45">Frente do cartão</span>
              </div>
              <div className="rfm-toolbar">
                <button type="button" onClick={() => applyFormatting(editFrenteRef, 'bold', setEditFrente)} aria-label="Negrito"><Bold className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(editFrenteRef, 'italic', setEditFrente)} aria-label="Itálico"><Italic className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(editFrenteRef, 'list', setEditFrente)} aria-label="Lista"><List className="h-3 w-3" /></button>
              </div>
            </div>
            <textarea
              ref={editFrenteRef}
              rows={4}
              placeholder="Digite a pergunta"
              value={editFrente}
              onChange={(e) => setEditFrente(e.target.value)}
              className="rfm-input font-display text-base"
            />
          </div>
          <div className="rfm-face" style={{ "--tone": "var(--accent)" } as CSSProperties}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rfm-tag">Resposta</span>
                <span className="text-xs text-foreground/45">Verso do cartão</span>
              </div>
              <div className="rfm-toolbar">
                <button type="button" onClick={() => applyFormatting(editVersoRef, 'bold', setEditVerso)} aria-label="Negrito"><Bold className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(editVersoRef, 'italic', setEditVerso)} aria-label="Itálico"><Italic className="h-3 w-3" /></button>
                <button type="button" onClick={() => applyFormatting(editVersoRef, 'list', setEditVerso)} aria-label="Lista"><List className="h-3 w-3" /></button>
              </div>
            </div>
            <textarea
              ref={editVersoRef}
              rows={5}
              placeholder="Digite a resposta"
              value={editVerso}
              onChange={(e) => setEditVerso(e.target.value)}
              className="rfm-input text-sm leading-relaxed"
            />
          </div>
          <div>
            <label className="rfm-label">Sub-baralho (Tópico)</label>
            <input
              type="text"
              placeholder="Ex: Osteologia, Arritmias..."
              value={editTopico}
              onChange={(e) => setEditTopico(e.target.value)}
              className="rfm-input"
              list="sub-baralhos-existentes-edit"
            />
            <datalist id="sub-baralhos-existentes-edit">
              {subBaralhosDoDeck.lista.map((s) => (
                <option key={s.nome} value={s.nome} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-foreground/40">
              💡 Deixe vazio para o card ficar em "Sem sub-baralho".
            </p>
          </div>
          {editCardId && (
            <div className="rfm-stat">
              <header className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-foreground/40">
                <History className="h-3 w-3 text-primary" /> Histórico de revisões
              </header>
              <ul className="space-y-2 text-xs">
                {(() => {
                  const history = getCardHistory(editCardId);
                  if (history.length === 0 || history[0]?.message === 'Nenhuma revisão ainda') {
                    return <li className="text-foreground/45 italic">Nenhuma revisão ainda</li>;
                  }
                  return history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <span className="text-foreground/55 tabular-nums">{h.data}</span>
                      <span className={`font-medium ${h.color || 'text-foreground/55'}`}>{h.rating}</span>
                    </li>
                  ));
                })()}
              </ul>
            </div>
          )}
        </div>
      </RfModal>

      {/* MODAL GERENCIAR MEMBROS */}
      <RfModal
        open={isMembersModalOpen && !!selectedDeckId}
        onClose={() => { setIsMembersModalOpen(false); setNewMemberId(""); setErrorMessage(""); }}
        title="Gerenciar membros"
        icon={<Users className="h-4 w-4" />}
        width="28rem"
      >
        <div className="space-y-2 mb-4">
          <p className="rfm-stat__label">Membros atuais</p>
          {(() => {
            const deck = decks.find(d => d.id === selectedDeckId);
            if (!deck) return <p className="text-sm text-foreground/55">Carregando...</p>;
            const currentUserId = localStorage.getItem('revisaflash_user_id') || '';
            const allMembers = [deck.owner_id, ...deck.shared_with];
            if (loadingMembers) {
              return <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-primary/60" /></div>;
            }
            if (allMembers.length === 0) return <p className="text-sm text-foreground/40">Nenhum membro encontrado.</p>;
            return allMembers.map((memberId, idx) => {
              const isOwner = memberId === deck.owner_id;
              const isYou = memberId === currentUserId;
              const info = membersInfo[memberId];
              const displayName = info?.name || memberId;
              const displayEmail = info?.email ? ` (${info.email})` : '';
              return (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-border bg-muted px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <UserCheck className="h-4 w-4 text-primary/60 shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">
                      {displayName}{displayEmail}
                      {isYou && <span className="ml-2 text-[10px] text-primary shrink-0">(você)</span>}
                      {isOwner && <span className="ml-2 text-[10px] text-foreground/40 shrink-0">(dona)</span>}
                    </span>
                  </div>
                  {!isOwner && isYou && (
                    <span className="text-[10px] text-foreground/30 shrink-0">Convidada</span>
                  )}
                  {isOwner && !isYou && (
                    <span className="text-[10px] text-foreground/30 shrink-0">Dona</span>
                  )}
                  {!isOwner && !isYou && (
                    <button
                      onClick={() => handleRemoveMember(memberId)}
                      disabled={isManagingMember}
                      className="rfm-icon-btn rfm-icon-btn--danger shrink-0 ml-2"
                      aria-label="Remover membro"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
        <div className="border-t border-border/60 pt-4">
          <label className="rfm-label">Adicionar por e-mail</label>
          <div className="flex gap-2 mt-1">
            <input
              type="email"
              placeholder="Digite o e-mail da amiga"
              value={newMemberId}
              onChange={(e) => setNewMemberId(e.target.value)}
              className="rfm-input flex-1"
            />
            <button
              onClick={handleAddMember}
              disabled={isManagingMember || !newMemberId.trim()}
              className="btn-sun inline-flex items-center gap-1 px-4 py-2 text-sm disabled:opacity-30"
            >
              {isManagingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Adicionar
            </button>
          </div>
          <p className="mt-1 text-[10px] text-foreground/40">
            💡 Digite o e-mail cadastrado na conta da pessoa.
          </p>
          {copyProgress && copyProgress.total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Copiando cards...
                </span>
                <span className="tabular-nums">
                  {Math.round((copyProgress.current / copyProgress.total) * 100)}% ({copyProgress.current}/{copyProgress.total})
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${(copyProgress.current / copyProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </RfModal>

      {/* MODAL: CARDS MAIS DIFÍCEIS */}
      <RfModal
        open={isHardestModalOpen}
        onClose={() => setIsHardestModalOpen(false)}
        title="Cards mais difíceis"
        icon={<Flame className="h-4 w-4" />}
        tone="var(--accent)"
        width="44rem"
        footer={
          <button
            className="rfm-btn rfm-btn--ghost"
            onClick={() => setIsHardestModalOpen(false)}
          >
            Fechar
          </button>
        }
      >
        <div role="tablist" className="rfm-tabs mb-4">
          <button
            role="tab"
            aria-selected={hardestTab === "hoje"}
            className="rfm-tab"
            onClick={() => setHardestTab("hoje")}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Cards de hoje
          </button>
          <button
            role="tab"
            aria-selected={hardestTab === "geral"}
            className="rfm-tab"
            onClick={() => setHardestTab("geral")}
          >
            <Library className="h-3.5 w-3.5" /> Geral
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto pr-1" style={{ "--tone": "var(--accent)" } as CSSProperties}>
          {hardestTab === "hoje" ? (
            <HardestList 
              title="Cards mais difíceis de hoje"
              titleIcon={<Flame className="h-3.5 w-3.5 text-accent" />}
              cards={getHardestCardsToday(15)}
              getCardMeta={getCardMeta}
            />
          ) : (
            <HardestList 
              title="Todos os cards mais difíceis"
              titleIcon={<BarChart3 className="h-3.5 w-3.5 text-primary" />}
              cards={getHardestCards(20)}
              getCardMeta={getCardMeta}
            />
          )}
        </div>
      </RfModal>

      {/* MODAL: GERENCIAR SUB-BARALHOS */}
      <RfModal
        open={isSubBaralhosModalOpen}
        onClose={() => { setIsSubBaralhosModalOpen(false); setEditandoSub(null); setNomeNovoSub(""); }}
        title="Gerenciar sub-baralhos"
        icon={<FolderTree className="h-4 w-4" />}
        tone="var(--primary)"
        width="34rem"
        footer={
          <button
            className="rfm-btn rfm-btn--ghost"
            onClick={() => { setIsSubBaralhosModalOpen(false); setEditandoSub(null); setNomeNovoSub(""); }}
          >
            Fechar
          </button>
        }
      >
        <p className="text-xs text-foreground/50 mb-4">
          Renomeie ou exclua os sub-baralhos deste baralho. Excluir um sub-baralho <strong>não apaga os cards</strong> — eles voltam para "Sem sub-baralho".
        </p>

        {subBaralhosDoDeck.lista.length === 0 && subBaralhosDoDeck.semTopico === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum sub-baralho criado ainda. Adicione cards com o campo "Tópico" preenchido para criar.
          </p>
        ) : (
          <div className="space-y-2">
            {subBaralhosDoDeck.lista.map((s) => {
              const isEditando = editandoSub === s.nome;
              return (
                <div
                  key={s.nome}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2"
                >
                  <span className="rfm-fcard__num shrink-0">
                    {s.count}
                  </span>
                  {isEditando ? (
                    <>
                      <input
                        type="text"
                        value={nomeNovoSub}
                        onChange={(e) => setNomeNovoSub(e.target.value)}
                        className="rfm-input flex-1 py-1.5"
                        placeholder="Novo nome"
                        autoFocus
                      />
                      <button
                        className="btn-sun px-3 py-1.5 text-xs"
                        onClick={async () => {
                          const novo = nomeNovoSub.trim();
                          if (!novo || novo === s.nome) {
                            setEditandoSub(null);
                            setNomeNovoSub("");
                            return;
                          }
                          const cardsDoSub = allCardsInDeck.filter(c => (c.topico || "").trim() === s.nome);
                          for (const c of cardsDoSub) {
                            await editCard(c.id, c.front, c.back, { topico: novo });
                          }
                          setEditandoSub(null);
                          setNomeNovoSub("");
                          if (filtroTopico === s.nome) setFiltroTopico(novo);
                          refreshFlashcards();
                          if (selectedDeckId) {
                            const atualizados = await getAllCardsByDeck(selectedDeckId);
                            setAllCardsInDeck(atualizados);
                          }
                        }}
                      >
                        Salvar
                      </button>
                      <button
                        className="rfm-btn rfm-btn--ghost px-3 py-1.5 text-xs"
                        onClick={() => { setEditandoSub(null); setNomeNovoSub(""); }}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm font-medium">{s.nome}</span>
                      <button
                        className="rfm-icon-btn"
                        title="Renomear"
                        onClick={() => { setEditandoSub(s.nome); setNomeNovoSub(s.nome); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rfm-icon-btn rfm-icon-btn--danger"
                        title="Excluir sub-baralho"
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: `Excluir sub-baralho "${s.nome}"?`,
                            description: "Os cards não serão apagados — eles voltam para 'Sem sub-baralho'.",
                            confirmText: "Excluir",
                            cancelText: "Cancelar",
                            destructive: true,
                          });
                          if (!ok) return;
                          const cardsDoSub = allCardsInDeck.filter(c => (c.topico || "").trim() === s.nome);
                          for (const c of cardsDoSub) {
                            await editCard(c.id, c.front, c.back, { topico: "" });
                          }
                          if (filtroTopico === s.nome) setFiltroTopico(null);
                          refreshFlashcards();
                          if (selectedDeckId) {
                            const atualizados = await getAllCardsByDeck(selectedDeckId);
                            setAllCardsInDeck(atualizados);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {subBaralhosDoDeck.semTopico > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-transparent px-3 py-2">
                <span className="rfm-fcard__num shrink-0">{subBaralhosDoDeck.semTopico}</span>
                <span className="flex-1 text-sm italic text-muted-foreground">Sem sub-baralho</span>
              </div>
            )}
          </div>
        )}
      </RfModal>
    </>
  );
}

// ============================================================
// BOTÕES FSRS
// ============================================================

function FsrsButton({ label, hint, variant = "default", onClick, disabled }: {
  label: string;
  hint: string;
  variant?: "again" | "hard" | "good" | "easy" | "default";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles: Record<string, string> = {
    again: "bg-destructive/20 text-destructive hover:bg-destructive/30",
    hard:  "bg-accent text-white hover:brightness-110",
    good:  "bg-[#F2C6A0] text-[#3A1F12] hover:brightness-105",
    easy:  "bg-primary text-primary-foreground hover:brightness-105",
    default: "bg-background/60 border border-border text-foreground/85 hover:border-primary/40",
  };
  const cls = styles[variant] ?? styles.default;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex flex-col items-center justify-center gap-0.5 rounded-full px-4 py-3 transition-all hover:-translate-y-0.5 font-semibold",
        cls,
        disabled ? "opacity-50 cursor-not-allowed hover:-translate-y-0" : "",
      ].join(" ")}
    >
      <span className="text-sm font-bold">{label}</span>
      <span className="text-[10px] font-medium opacity-80">{hint}</span>
    </button>
  );
}

// ============================================================
// LISTA DE CARDS DIFÍCEIS
// ============================================================
function HardestList({ title, titleIcon, cards, getCardMeta }: { 
  title: string; 
  titleIcon?: React.ReactNode;
  cards: any[]; 
  getCardMeta: (id: string) => any;
}) {
  if (cards.length === 0) {
    return <p className="text-sm text-foreground/40 text-center py-8">Nenhum card encontrado.</p>;
  }
  
  return (
    <div className="space-y-2.5">
      <p className="rfm-stat__label mb-2 flex items-center gap-1.5">
        {titleIcon}
        {title}
      </p>
      {cards.map((card, index) => {
        const meta = getCardMeta(card.id);
        const lapses = card.lapses || 0;
        const difficulty = card.difficulty || 0;
        const stability = card.stability || 0;
        const isLeech = lapses >= 5;
        const topico = card.topico || meta.topico;
        
        return (
          <div key={card.id} className="rfm-row">
            <span className="rfm-rank">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground leading-snug">
                <FormattedText text={card.front} />
              </p>
              {topico && (
                <span className="text-[10px] text-primary">🏷 {topico}</span>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rfm-meta"><X className="h-3 w-3 text-destructive" /> Erros: <b className="text-accent">{lapses}</b></span>
                <span className="rfm-meta"><BarChart3 className="h-3 w-3" /> Dificuldade: {difficulty.toFixed(1)}</span>
                <span className="rfm-meta"><Zap className="h-3 w-3 text-primary" /> Estabilidade: {stability.toFixed(1)}</span>
                {isLeech && <span className="rfm-meta font-semibold text-accent"><Droplet className="h-3 w-3" /> Sanguessuga</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}