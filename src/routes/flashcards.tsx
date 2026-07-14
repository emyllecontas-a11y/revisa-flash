import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { 
  Plus, RotateCw, ChevronLeft, Layers, Sparkles, Trash2, Edit, 
  CheckCircle, Search, Filter, Pencil, X, Bold, Italic, List,
  History, AlertTriangle, Loader2, Clock, TrendingUp, BarChart,
  Users, UserPlus, UserMinus, UserCheck
} from "lucide-react";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import type { Rating } from "@/lib/fsrs/types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { findUserByEmail, findUsersByIds } from "@/services/clerkService";

// ============================================================
// 🔥 FUNÇÃO PARA RENDERIZAR TEXTO COM FORMATAÇÃO
// ============================================================
function renderFormattedText(text: string): string {
  if (!text) return '';
  // Escapa HTML básico para segurança
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // **texto** → <strong>texto</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *texto* → <em>texto</em> (não confundir com listas)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Listas: - item → <li>item</li> (simples)
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
  
  // 🔥 NOVOS ESTADOS PARA MEMBROS E PROGRESSO
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
  const [deckCor, setDeckCor] = useState("#14B8A6");
  
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
  // 🔥 CARREGAR INFORMAÇÕES DOS MEMBROS QUANDO O MODAL ABRIR
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
  // FILTRAR CARDS
  // ============================================================
  const deckCards = useMemo(() => {
    if (filterStatus === "todos") {
      return allCardsInDeck;
    } else {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return allCardsInDeck.filter(c => {
        const due = new Date(c.dueDate);
        due.setHours(0, 0, 0, 0);
        return c.reps === 0 || due <= hoje;
      });
    }
  }, [allCardsInDeck, filterStatus]);

  // ============================================================
  // FUNÇÃO PARA ESTATÍSTICAS DOS DECKS
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
  // FUNÇÃO PARA DADOS DO GRÁFICO
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
  // FUNÇÕES DE FORMATAÇÃO
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
  // FUNÇÕES DE CRUD (TODAS MANTIDAS)
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
      setDeckCor("#14B8A6");
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
      await addCard(selectedDeckId, newCardFrente.trim(), newCardVerso.trim());
      const allCards = await getAllCardsByDeck(selectedDeckId);
      const newCard = allCards.find(c => c.front === newCardFrente.trim() && c.deck_id === selectedDeckId);
      if (newCard && newCardTopico.trim()) {
        setCardMeta(newCard.id, { topico: newCardTopico.trim() });
      }
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
  }, [selectedDeckId, newCardFrente, newCardVerso, newCardTopico, addCard, setCardMeta, refreshFlashcards, getAllCardsByDeck]);

  const handleEditCard = useCallback(async () => {
    if (!editCardId) return;
    if (!editFrente.trim() || !editVerso.trim()) {
      setErrorMessage("Preencha a pergunta e a resposta");
      return;
    }
    try {
      setIsSaving(true);
      await editCard(editCardId, editFrente.trim(), editVerso.trim());
      if (editTopico.trim()) {
        setCardMeta(editCardId, { topico: editTopico.trim() });
      }
      
      if (editFromStudy) {
        setSessaoCards(prev => prev.map(card => 
          card.id === editCardId 
            ? { ...card, front: editFrente.trim(), back: editVerso.trim() }
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
  }, [editCardId, editFrente, editVerso, editTopico, editCard, setCardMeta, refreshFlashcards, selectedDeckId, getAllCardsByDeck, editFromStudy]);

  const handleDeleteDeck = useCallback(async (deckId: string) => {
    if (!confirm("Tem certeza que deseja excluir este baralho e todos os seus flashcards?")) return;
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
  }, [selectedDeckId, deleteDeck]);

  const handleDeleteCard = useCallback(async (cardId: string) => {
    if (!confirm("Tem certeza que deseja excluir este flashcard?")) return;
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
    } catch (error: any) {
      console.error("❌ Erro ao deletar flashcard:", error);
      setErrorMessage("Erro ao deletar flashcard: " + (error.message || "Erro desconhecido"));
    }
  }, [deleteCard, selectedDeckId, getAllCardsByDeck, modo, sessaoCards.length]);

  const handleRenameDeck = useCallback(async () => {
    if (!selectedDeckId || !renameName.trim()) {
      setErrorMessage("Digite um nome para o baralho");
      return;
    }
    try {
      setIsRenaming(true);
      setErrorMessage("");
      const deck = decks.find(d => d.id === selectedDeckId);
      const currentColor = deck?.color || "#14B8A6";
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
  // 🔥 FUNÇÕES PARA GERENCIAR MEMBROS (COM PROGRESSO)
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

      // 1. Busca o user_id pelo e-mail
      const foundUserId = await findUserByEmail(newMemberId.trim());
      if (!foundUserId) {
        throw new Error(`Nenhum usuário encontrado com o e-mail: ${newMemberId.trim()}`);
      }

      // 2. Adiciona o membro com callback de progresso
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

      // 3. Atualiza a lista de membros (busca novamente)
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
    if (!confirm(`Tem certeza que deseja remover este membro?`)) return;
    try {
      setIsManagingMember(true);
      await removeMemberFromDeck(selectedDeckId, userIdToRemove);
      refreshFlashcards();
      
      // Atualiza a lista de membros
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
  }, [selectedDeckId, removeMemberFromDeck, refreshFlashcards, decks]);

  // ============================================================
  // FUNÇÃO DE INICIAR ESTUDO
  // ============================================================
  const iniciarEstudo = useCallback(async (deckId: string) => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const cards = await getAllCardsByDeck(deckId);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const due = cards.filter(c => {
        const dueDate = new Date(c.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return c.reps === 0 || dueDate <= hoje;
      });
      if (due.length === 0) {
        setErrorMessage("🎉 Nenhum flashcard para revisar neste baralho!");
        setTimeout(() => setErrorMessage(""), 3000);
        setIsStarting(false);
        return;
      }
      
      const sortedDue = due.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      
      setSessaoCards(sortedDue);
      setSessionStats({
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
        novos: due.filter(c => c.reps === 0).length,
        total: due.length,
      });
      setSessionStartTime(new Date());
      setSelectedDeckId(deckId);
      setCurrentCardIndex(0);
      setVirado(false);
      setModo("estudo");
    } catch (error) {
      console.error("Erro ao iniciar estudo:", error);
      setErrorMessage("Erro ao iniciar estudo");
    } finally {
      setIsStarting(false);
    }
  }, [getAllCardsByDeck, isStarting]);

  // ============================================================
  // FUNÇÃO DE AVALIAÇÃO
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
    refreshFlashcards();
  }, [refreshFlashcards]);

  const voltarParaDecks = useCallback(() => {
    setSelectedDeckId(null);
    setModo("decks");
    setSessaoCards([]);
    setSessionStats(null);
    setSessionStartTime(null);
  }, []);

  const openEditFromStudy = useCallback((card: any) => {
    const meta = getCardMeta(card.id);
    setEditCardId(card.id);
    setEditFrente(card.front);
    setEditVerso(card.back);
    setEditTopico(meta.topico || "");
    setEditFromStudy(true);
    setIsEditModalOpen(true);
  }, [getCardMeta]);

  const openEditModal = useCallback((card: any) => {
    const meta = getCardMeta(card.id);
    setEditCardId(card.id);
    setEditFrente(card.front);
    setEditVerso(card.back);
    setEditTopico(meta.topico || "");
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
            }}
            className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-foreground/55 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar aos decks
          </button>
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="font-medium uppercase tracking-widest text-primary">{deck?.name || "Estudo"}</span>
              <span className="tabular-nums text-foreground/50">Card {currentCardIndex + 1} de {sessaoCards.length}</span>
            </div>
            <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((currentCardIndex + 1) / sessaoCards.length) * 100}%` }} />
            </div>
            
            <div className="flex justify-end mb-2">
              <button
                onClick={() => openEditFromStudy(currentCard)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/60 hover:bg-surface-2 transition-colors"
              >
                <Edit className="h-3.5 w-3.5" /> Editar card
              </button>
            </div>
            
            <button
              onClick={() => setVirado((v) => !v)}
              className="mt-2 grid min-h-[300px] w-full place-items-center rounded-2xl border border-border bg-surface p-10 text-center transition-all hover:border-primary/40 sm:min-h-[360px]"
              style={{ boxShadow: virado ? "var(--shadow-glow)" : undefined }}
            >
              {!virado ? (
                <div className="space-y-5">
                  <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-primary">Pergunta</div>
                  <p className="font-display text-balance text-xl font-medium leading-snug sm:text-2xl">
                    <FormattedText text={currentCard.front} />
                  </p>
                  <p className="text-xs text-foreground/40">Clique para revelar a resposta</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-primary">Resposta</div>
                  <p className="text-balance text-lg font-medium leading-snug text-primary sm:text-xl">
                    <FormattedText text={currentCard.back} />
                  </p>
                </div>
              )}
            </button>
            {virado && (
              <div className="mt-6 grid grid-cols-4 gap-2 rf-fade-in">
                <FsrsButton label="Errei" hint="10 min" tone="accent" onClick={() => handleRating("again")} disabled={isRating} />
                <FsrsButton label="Difícil" hint="2 dias" onClick={() => handleRating("hard")} disabled={isRating} />
                <FsrsButton label="Bom" hint="4 dias" primary onClick={() => handleRating("good")} disabled={isRating} />
                <FsrsButton label="Fácil" hint="12 dias" onClick={() => handleRating("easy")} disabled={isRating} />
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
              <div className="rounded-full bg-green-500/10 p-4">
                <CheckCircle className="h-12 w-12 text-green-400" />
              </div>
            </div>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">🎉 Revisão concluída!</h2>
            <p className="mt-2 text-sm text-foreground/55">
              Você revisou todos os flashcards do baralho <span className="font-medium text-foreground">{deck?.name}</span>.
            </p>
            
            {stats && (
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <div className="rounded-lg bg-background/40 p-4">
                  <div className="text-2xl font-bold text-green-400">{stats.good + stats.easy}</div>
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
              <button onClick={voltarDaConclusao} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">Voltar para os decks</button>
              <button
                onClick={async () => {
                  if (selectedDeckId) {
                    setIsRestarting(true);
                    try {
                      const cards = await getAllCardsByDeck(selectedDeckId);
                      const hoje = new Date();
                      hoje.setHours(0, 0, 0, 0);
                      const due = cards.filter(c => {
                        const dueDate = new Date(c.dueDate);
                        dueDate.setHours(0, 0, 0, 0);
                        return c.reps === 0 || dueDate <= hoje;
                      });
                      if (due.length > 0) {
                        const sortedDue = due.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
                        setSessaoCards(sortedDue);
                        setSessionStats({
                          again: 0,
                          hard: 0,
                          good: 0,
                          easy: 0,
                          novos: due.filter(c => c.reps === 0).length,
                          total: due.length,
                        });
                        setSessionStartTime(new Date());
                        setModo("estudo");
                        setCurrentCardIndex(0);
                        setVirado(false);
                      } else {
                        setErrorMessage("🎉 Nenhum flashcard para revisar neste baralho!");
                        setTimeout(() => setErrorMessage(""), 3000);
                        voltarDaConclusao();
                      }
                    } catch (error) {
                      console.error(error);
                    } finally {
                      setIsRestarting(false);
                    }
                  }
                }}
                disabled={isRestarting}
                className="rounded-lg border border-border bg-surface-2 px-6 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-white/5 disabled:opacity-50 inline-flex items-center gap-2"
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
    const deck = decks.find(d => d.id === selectedDeckId);
    if (!deck) {
      setSelectedDeckId(null);
    } else {
      const deckStats = getDeckStats(selectedDeckId);
      const deckMeta = getDeckMeta(selectedDeckId);
      const isErrorDeck = deck.name === "Erros";
      const deckColor = deck.color || '#14B8A6';
      const chartData = getStabilityOverTime(selectedDeckId);
      
const currentUserId = localStorage.getItem('revisaflash_user_id') || '';
const isOwner = (deck.owner_id === currentUserId) || (!deck.owner_id && deck.user_id === currentUserId);
      
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Users className="h-3.5 w-3.5" /> Gerenciar membros
                </button>
              )}
              <button
                onClick={() => { 
                  setRenameName(deck.name); 
                  setRenameDescription(deck.description || ''); 
                  setDeckDisciplina(deckMeta.disciplina || '');
                  setIsRenameModalOpen(true); 
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface-2"
              ><Pencil className="h-3.5 w-3.5" /> Editar baralho</button>
              <button
                onClick={() => { setIsAddCardModalOpen(true); setErrorMessage(''); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              ><Plus className="h-3.5 w-3.5" /> Novo flashcard</button>
            </div>
          </header>
          
          {chartData.length > 0 && (
            <div className="mb-6 rf-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Evolução da Estabilidade Média</h3>
                <span className="text-xs text-foreground/40">(por mês)</span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="month" tick={{ fill: '#8899aa', fontSize: 10 }} />
                    <YAxis 
                      domain={[0, 'auto']} 
                      tick={{ fill: '#8899aa', fontSize: 10 }} 
                      label={{ value: 'Estabilidade', angle: -90, position: 'insideLeft', fill: '#8899aa', fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: '8px' }}
                      labelStyle={{ color: '#cccccc' }}
                      formatter={(value: any) => [`${value}`, 'Estabilidade média']}
                    />
                    <Line type="monotone" dataKey="stability" stroke="#14B8A6" strokeWidth={2} dot={{ fill: '#14B8A6', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-center text-[10px] text-foreground/30">
                {chartData.length} meses de dados · Média geral: {(chartData.reduce((acc, d) => acc + d.stability, 0) / chartData.length).toFixed(1)}
              </div>
            </div>
          )}
          
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini l="Cards" v={deckStats.total} />
            <Mini l="Para revisar" v={deckStats.due} tone="accent" />
            <Mini l="Novos" v={deckStats.novos} />
            <Mini l="Maturidade" v={deckStats.total > 0 ? `${Math.round((deckStats.total - deckStats.novos) / deckStats.total * 100)}%` : '0%'} />
          </div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-foreground/40" />
              <button
                onClick={() => setFilterStatus("todos")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterStatus === "todos"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-foreground/65 hover:bg-surface-2"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterStatus("para_revisar")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterStatus === "para_revisar"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-foreground/65 hover:bg-surface-2"
                }`}
              >
                Para revisar
              </button>
              <span className="text-xs text-foreground/40 ml-1">
                {loadingCards ? "(carregando...)" : `${deckCards.length} cards`}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-foreground/40" />
              <input placeholder="Buscar nesse baralho…" className="w-56 bg-transparent text-xs outline-none placeholder:text-foreground/35" value="" onChange={() => {}} />
            </div>
          </div>
          <div className="grid gap-3">
            {loadingCards ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : deckCards.length > 0 ? (
              deckCards.map((card, index) => {
                const status = getStatusBadge(card.reps, card.dueDate);
                const meta = getCardMeta(card.id);
                return (
                  <article key={card.id} className="rf-card rf-card-hover group flex items-start gap-3 sm:gap-4 p-4 sm:p-5 w-full max-w-full overflow-hidden">
                    <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-md bg-background/60 font-display text-xs font-semibold text-foreground/60 tabular-nums">{index + 1}</div> 
                    {isErrorDeck && <AlertTriangle className="h-3 w-3 text-accent ml-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>
                        {meta.topico && <span className="text-[11px] text-foreground/45">{meta.topico}</span>}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-foreground break-words whitespace-normal">
                        <FormattedText text={card.front} />
                      </p>
                      <p className="mt-1 text-xs text-foreground/50 break-words whitespace-normal">
                        <FormattedText text={card.back} />
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditModal(card)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-foreground/60 transition-colors hover:border-primary/50 hover:text-primary"><Edit className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDeleteCard(card.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-foreground/60 transition-colors hover:border-red-500/50 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10">
                <p className="text-sm text-foreground/40">
                  {filterStatus === "todos" 
                    ? "Nenhum flashcard neste baralho." 
                    : "Nenhum flashcard para revisar agora. Volte mais tarde!"}
                </p>
              </div>
            )}
          </div>
        </AppShell>
      );
    }
  } else {
    conteudo = (
      <AppShell breadcrumb="Flashcards" title="Decks">
        <div id="flashcards-header">
        {errorMessage && (
          <div className={`mb-4 rounded-xl border p-3 text-sm ${errorMessage.includes("🎉") || errorMessage.includes("✅") ? "border-green-500/20 bg-green-500/20 text-green-400" : "border-red-500/20 bg-red-500/20 text-red-400"}`}>
            {errorMessage}
          </div>
        )}
        <div className="-mt-4 mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-xl text-sm text-foreground/55">Algoritmo de repetição espaçada FSRS. Cards são apresentados no momento ideal para fixar o conteúdo.</p>
          <button onClick={() => { setIsModalOpen(true); setErrorMessage(""); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Novo baralho
          </button>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini icon={<Layers className="h-4 w-4" />} l="Decks" v={decks?.length || 0} />
          <Mini icon={<Sparkles className="h-4 w-4" />} l="Cards totais" v={stats.totalCards} />
          <Mini l="Para revisar" v={stats.dueCards} tone="accent" />
          <Mini l="Novos" v={dueCards.filter(c => c.reps === 0).length} />
        </div>
        {decks && decks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {decks.map((deck) => {
              const stats = getDeckStats(deck.id);
              const meta = getDeckMeta(deck.id);
              const deckColor = deck.color || '#14B8A6';
              
              return (
                <article
                  key={deck.id}
                  className="rf-card rf-card-hover p-5 cursor-pointer transition-all"
                  style={{ borderLeft: `4px solid ${deckColor}` }}
                  onClick={() => setSelectedDeckId(deck.id)}
                >
                  <header className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl"
                        style={{
                          backgroundColor: `${deckColor}40`,
                          color: deckColor,
                        }}
                      >
                        <Layers className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-display text-base font-semibold hover:text-primary">
                          {deck.name}
                          {deck.is_shared && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                              <Users className="h-3 w-3" /> Compartilhado
                            </span>
                          )}
                        </h3>
                        {deck.name === "Erros" && <AlertTriangle className="h-4 w-4 text-accent inline-block ml-1" />}
                        <p className="mt-0.5 text-xs text-foreground/45">{deck.description || "Sem descrição"}</p>
                        {meta.disciplina && <span className="text-[10px] text-foreground/40">{meta.disciplina}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeckId(deck.id);
                          setRenameName(deck.name);
                          setRenameDescription(deck.description || "");
                          setDeckDisciplina(meta.disciplina || '');
                          setIsRenameModalOpen(true);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-white/5 hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-white/5 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </header>
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-background/40 p-3 text-center">
                    <Pill l="Total" v={stats.total} />
                    <Pill l="Due" v={stats.due} accent />
                    <Pill l="Novos" v={stats.novos} />
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); iniciarEstudo(deck.id); }}
                      disabled={stats.due === 0 || isStarting}
                      className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30 inline-flex items-center justify-center gap-2"
                    >
                      {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {stats.due > 0 ? `Estudar ${stats.due} cards` : "Nada para hoje"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedDeckId(deck.id); setIsAddCardModalOpen(true); setErrorMessage(""); }}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-white/5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
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
  // RENDERIZAÇÃO FINAL (conteúdo + modais)
  // ============================================================
  return (
    <>
      {conteudo}

      {/* MODAL: CRIAR BARALHO (ATUALIZADO) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Criar novo baralho</h3>
              <button
                onClick={() => { setIsModalOpen(false); setDeckName(""); setDeckDescription(""); setDeckDisciplina(""); setDeckCor("#14B8A6"); setIsShared(false); setSharedWithInput(""); setErrorMessage(""); }}
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground/70">Nome do baralho *</label>
                <input
                  type="text"
                  placeholder="Digite o nome do baralho"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground/70">Descrição</label>
                <textarea
                  rows={2}
                  placeholder="Descreva o conteúdo do baralho"
                  value={deckDescription}
                  onChange={(e) => setDeckDescription(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1 resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground/70">Disciplina</label>
                  <input
                    type="text"
                    placeholder="Ex: Patologia Oral"
                    value={deckDisciplina}
                    onChange={(e) => setDeckDisciplina(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground/70">Cor de destaque</label>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {["#14B8A6", "#FB7185", "#F59E0B", "#60A5FA", "#A78BFA", "#34D399", "#F472B6", "#FBBF24"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setDeckCor(c)}
                        className={`h-8 w-8 rounded-full border-2 transition-all ${deckCor === c ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="border-t border-border/50 pt-4 mt-2">
                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setIsShared(!isShared)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isShared ? 'bg-primary' : 'bg-white/10'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isShared ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Compartilhar este baralho com amigas
                  </span>
                </div>
                
                {isShared && (
                  <div className="animate-fadeIn">
                    <label className="text-sm font-medium text-foreground/70">
                      IDs das convidadas (separados por vírgula)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: user_abc123, user_def456"
                      value={sharedWithInput}
                      onChange={(e) => setSharedWithInput(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                    />
                    <p className="mt-1 text-[10px] text-foreground/40">
                      💡 Digite o user_id de cada amiga. Elas verão os cards, mas com estatísticas próprias.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setIsModalOpen(false); setDeckName(""); setDeckDescription(""); setDeckDisciplina(""); setDeckCor("#14B8A6"); setIsShared(false); setSharedWithInput(""); setErrorMessage(""); }}
                  className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateDeck}
                  disabled={isSaving}
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Criando..." : "Criar baralho"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR FLASHCARD */}
      {isAddCardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Adicionar flashcard</h3>
              <button
                onClick={() => { setIsAddCardModalOpen(false); setNewCardFrente(""); setNewCardVerso(""); setNewCardTopico(""); setErrorMessage(""); }}
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="rf-card p-5 border border-border">
                <header className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">Pergunta</span>
                    <span className="text-xs text-foreground/45">Frente do cartão</span>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5 text-foreground/55">
                    <button type="button" onClick={() => applyFormatting(newFrenteRef, 'bold', setNewCardFrente)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Bold className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(newFrenteRef, 'italic', setNewCardFrente)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Italic className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(newFrenteRef, 'list', setNewCardFrente)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><List className="h-3 w-3" /></button>
                  </div>
                </header>
                <textarea
                  ref={newFrenteRef}
                  rows={4}
                  placeholder="Digite a pergunta"
                  value={newCardFrente}
                  onChange={(e) => setNewCardFrente(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-background/60 px-4 py-3 font-display text-base text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                />
              </div>

              <div className="rf-card p-5 border border-border">
                <header className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">Resposta</span>
                    <span className="text-xs text-foreground/45">Verso do cartão</span>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5 text-foreground/55">
                    <button type="button" onClick={() => applyFormatting(newVersoRef, 'bold', setNewCardVerso)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Bold className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(newVersoRef, 'italic', setNewCardVerso)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Italic className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(newVersoRef, 'list', setNewCardVerso)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><List className="h-3 w-3" /></button>
                  </div>
                </header>
                <textarea
                  ref={newVersoRef}
                  rows={5}
                  placeholder="Digite a resposta"
                  value={newCardVerso}
                  onChange={(e) => setNewCardVerso(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground/70">Tópico</label>
                <input
                  type="text"
                  placeholder="Ex: Lesões ósseas"
                  value={newCardTopico}
                  onChange={(e) => setNewCardTopico(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => { setIsAddCardModalOpen(false); setNewCardFrente(""); setNewCardVerso(""); setNewCardTopico(""); setErrorMessage(""); }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/65 hover:bg-white/5 transition-colors"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleAddCard(true)}
                  disabled={isSaving}
                  className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Salvando..." : "Salvar e criar outro"}
                </button>
                <button
                  onClick={() => handleAddCard(false)}
                  disabled={isSaving}
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Salvando..." : "Salvar cartão"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RENOMEAR BARALHO */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <h3 className="mb-4 text-lg font-semibold text-foreground">✏️ Renomear Baralho</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Novo nome do baralho"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
              />
              <input
                type="text"
                placeholder="Nova descrição (opcional)"
                value={renameDescription}
                onChange={(e) => setRenameDescription(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
              />
              <input
                type="text"
                placeholder="Disciplina (opcional)"
                value={deckDisciplina}
                onChange={(e) => setDeckDisciplina(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsRenameModalOpen(false); setRenameName(""); setRenameDescription(""); setDeckDisciplina(""); setErrorMessage(""); }}
                  className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors"
                  disabled={isRenaming}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenameDeck}
                  disabled={isRenaming}
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isRenaming ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR FLASHCARD */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">✏️ Editar flashcard</h3>
              <button
                onClick={() => { setIsEditModalOpen(false); setEditCardId(null); setEditFrente(""); setEditVerso(""); setEditTopico(""); setErrorMessage(""); }}
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
                onClick={() => {
                  if (editCardId && confirm("Tem certeza que deseja excluir este flashcard?")) {
                    handleDeleteCard(editCardId);
                    setIsEditModalOpen(false);
                    setEditCardId(null);
                    setEditFrente("");
                    setEditVerso("");
                    setEditTopico("");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir cartão
              </button>
            </div>

            <div className="space-y-4">
              <div className="rf-card p-5 border border-border">
                <header className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">Pergunta</span>
                    <span className="text-xs text-foreground/45">Frente do cartão</span>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5 text-foreground/55">
                    <button type="button" onClick={() => applyFormatting(editFrenteRef, 'bold', setEditFrente)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Bold className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(editFrenteRef, 'italic', setEditFrente)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Italic className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(editFrenteRef, 'list', setEditFrente)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><List className="h-3 w-3" /></button>
                  </div>
                </header>
                <textarea
                  ref={editFrenteRef}
                  rows={4}
                  placeholder="Digite a pergunta"
                  value={editFrente}
                  onChange={(e) => setEditFrente(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-background/60 px-4 py-3 font-display text-base text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                />
              </div>

              <div className="rf-card p-5 border border-border">
                <header className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">Resposta</span>
                    <span className="text-xs text-foreground/45">Verso do cartão</span>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5 text-foreground/55">
                    <button type="button" onClick={() => applyFormatting(editVersoRef, 'bold', setEditVerso)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Bold className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(editVersoRef, 'italic', setEditVerso)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><Italic className="h-3 w-3" /></button>
                    <button type="button" onClick={() => applyFormatting(editVersoRef, 'list', setEditVerso)} className="grid h-6 w-6 place-items-center rounded hover:bg-white/5 hover:text-foreground"><List className="h-3 w-3" /></button>
                  </div>
                </header>
                <textarea
                  ref={editVersoRef}
                  rows={5}
                  placeholder="Digite a resposta"
                  value={editVerso}
                  onChange={(e) => setEditVerso(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground/70">Tópico</label>
                <input
                  type="text"
                  placeholder="Ex: Lesões ósseas"
                  value={editTopico}
                  onChange={(e) => setEditTopico(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
                />
              </div>

              {editCardId && (
                <div className="rf-card p-5 border border-border">
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => { setIsEditModalOpen(false); setEditCardId(null); setEditFrente(""); setEditVerso(""); setEditTopico(""); setErrorMessage(""); }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground/65 hover:bg-white/5 transition-colors"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditCard}
                  disabled={isSaving}
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 MODAL GERENCIAR MEMBROS (COM NOMES E PROGRESSO) */}
      {isMembersModalOpen && selectedDeckId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Gerenciar membros
              </h3>
              <button
                onClick={() => { setIsMembersModalOpen(false); setNewMemberId(""); setErrorMessage(""); }}
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-2 mb-4">
                <p className="text-xs text-foreground/40">Membros atuais:</p>
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
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
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
                            className="text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-30 shrink-0 ml-2"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              
              <div className="border-t border-border/50 pt-4">
                <label className="text-sm font-medium text-foreground/70">Adicionar por e-mail</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="email"
                    placeholder="Digite o e-mail da amiga"
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                  />
                  <button
                    onClick={handleAddMember}
                    disabled={isManagingMember || !newMemberId.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity inline-flex items-center gap-1"
                  >
                    {isManagingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Adicionar
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-foreground/40">
                  💡 Digite o e-mail cadastrado na conta da pessoa.
                </p>

                {/* 🔥 BARRA DE PROGRESSO */}
                {copyProgress && copyProgress.total > 0 && (
                  <div className="mt-3 animate-fadeIn">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// COMPONENTES VISUAIS
// ============================================================

function FsrsButton({ label, hint, tone = "default", primary, onClick, disabled }: {
  label: string;
  hint: string;
  tone?: "default" | "accent";
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex flex-col items-center gap-0.5 rounded-xl border bg-background/60 px-2 py-3 transition-all hover:-translate-y-0.5",
        primary ? "border-primary/60 ring-1 ring-primary/30" : "border-border hover:border-primary/40",
        disabled ? "opacity-50 cursor-not-allowed hover:-translate-y-0" : "",
      ].join(" ")}
    >
      <span className={["text-xs font-semibold", tone === "accent" ? "text-accent" : primary ? "text-primary" : "text-foreground/85"].join(" ")}>{label}</span>
      <span className="text-[10px] text-foreground/40">{hint}</span>
    </button>
  );
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

function Pill({ l, v, accent }: { l: string; v: number; accent?: boolean }) {
  return (
    <div>
      <div className={["font-display text-sm font-semibold tabular-nums", accent ? "text-accent" : "text-foreground"].join(" ")}>{v}</div>
      <div className="text-[10px] uppercase tracking-widest text-foreground/40">{l}</div>
    </div>
  );
}