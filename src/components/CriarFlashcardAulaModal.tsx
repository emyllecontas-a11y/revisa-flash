import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { useToast } from "@/hooks/useToast";

interface CriarFlashcardAulaModalProps {
  open: boolean;
  onClose: () => void;
  aulaTitulo?: string;
  aulaDisciplina?: string;
}

export function CriarFlashcardAulaModal({ open, onClose, aulaTitulo, aulaDisciplina }: CriarFlashcardAulaModalProps) {
  const { decks, createDeck, addCard } = useFlashcardContext();
  const { showToast } = useToast();

  const [front, setFront] = useState(aulaTitulo ? `Resumo / Pergunta sobre: ${aulaTitulo}` : "");
  const [back, setBack] = useState("");
  const [deckId, setDeckId] = useState<string>(decks[0]?.id || "");
  const [showNovaColecao, setShowNovaColecao] = useState(false);
  const [novoDeckNome, setNovoDeckNome] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const handleCriarNovaColecao = async () => {
    if (!novoDeckNome.trim()) return;
    try {
      await createDeck(novoDeckNome.trim(), aulaDisciplina || "Aulas");
      showToast("Baralho criado com sucesso!", "success");
      setNovoDeckNome("");
      setShowNovaColecao(false);
      // Seleciona o recém criado (último deck)
      if (decks.length > 0) {
        setDeckId(decks[decks.length - 1].id);
      }
    } catch (err) {
      console.error(err);
      showToast("Erro ao criar baralho", "error");
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) {
      showToast("Preencha a frente e o verso do flashcard.", "error");
      return;
    }

    let targetDeckId = deckId;
    if (!targetDeckId && decks.length > 0) {
      targetDeckId = decks[0].id;
    }

    if (!targetDeckId) {
      showToast("Crie ou selecione um baralho primeiro.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await addCard(targetDeckId, front.trim(), back.trim());
      showToast("Flashcard criado com sucesso!", "success");
      setFront("");
      setBack("");
      onClose();
    } catch (err) {
      console.error(err);
      showToast("Erro ao salvar flashcard", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">Criar flashcard</h2>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-1.5">
              Frente <span className="text-primary">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Escreva aqui a pergunta ou enunciado..."
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="w-full rounded-2xl border border-border bg-background p-3.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-foreground/35 resize-none shadow-sm"
              required
            />
            <span className="mt-1 block text-[11px] text-foreground/40">A pergunta ou o enunciado</span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-1.5">
              Verso <span className="text-primary">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Escreva aqui a resposta..."
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className="w-full rounded-2xl border border-border bg-background p-3.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-foreground/35 resize-none shadow-sm"
              required
            />
            <span className="mt-1 block text-[11px] text-foreground/40">A resposta</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
                Coleção / Baralho
              </label>
              <button
                type="button"
                onClick={() => setShowNovaColecao(!showNovaColecao)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {showNovaColecao ? "Selecionar existente" : "Nova coleção"}
              </button>
            </div>

            {showNovaColecao ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome da nova coleção..."
                  value={novoDeckNome}
                  onChange={(e) => setNovoDeckNome(e.target.value)}
                  className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/35"
                />
                <button
                  type="button"
                  onClick={handleCriarNovaColecao}
                  className="rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Criar
                </button>
              </div>
            ) : (
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary transition-colors"
              >
                {decks.length === 0 ? (
                  <option value="">Nenhum baralho encontrado</option>
                ) : (
                  decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name} ({deck.description || "Geral"})
                    </option>
                  ))
                )}
              </select>
            )}
            {decks.length === 0 && !showNovaColecao && (
              <p className="mt-1 text-[11px] text-foreground/45">Nenhuma coleção ainda. Crie uma em "Nova coleção".</p>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-border mt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2 shadow-md"
            >
              {isSaving ? "Salvando..." : "Salvar flashcard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
