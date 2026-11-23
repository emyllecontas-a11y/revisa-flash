import { useState } from "react";
import { X, Sparkles, Image, Trash2 } from "lucide-react";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { useToast } from "@/hooks/useToast";
import { compressAndUploadImage, deleteFlashcardImage, isValidImageFile, formatFileSize } from "@/services/flashcardImageService";
import { useAppUser } from "@/contexts/UserContext";

interface CriarFlashcardAulaModalProps {
  open: boolean;
  onClose: () => void;
  aulaTitulo?: string;
  aulaDisciplina?: string;
}

export function CriarFlashcardAulaModal({ open, onClose, aulaTitulo, aulaDisciplina }: CriarFlashcardAulaModalProps) {
  const { decks, createDeck, addCard } = useFlashcardContext();
  const { userId } = useAppUser();
  const toast = useToast();

  const [front, setFront] = useState(aulaTitulo ? `Resumo / Pergunta sobre: ${aulaTitulo}` : "");
  const [back, setBack] = useState("");
  const [deckId, setDeckId] = useState<string>(decks[0]?.id || "");
  const [showNovaColecao, setShowNovaColecao] = useState(false);
  const [novoDeckNome, setNovoDeckNome] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Estados para imagens
  const [frontImageFile, setFrontImageFile] = useState<File | null>(null);
  const [backImageFile, setBackImageFile] = useState<File | null>(null);
  const [frontImagePreview, setFrontImagePreview] = useState<string | null>(null);
  const [backImagePreview, setBackImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  if (!open) return null;

  // Limpar previews ao fechar
  const handleClose = () => {
    if (frontImagePreview) URL.revokeObjectURL(frontImagePreview);
    if (backImagePreview) URL.revokeObjectURL(backImagePreview);
    onClose();
  };

  const handleFrontImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidImageFile(file)) {
      toast.error("Tipo de arquivo não suportado. Use PNG, JPEG ou WebP.");
      return;
    }

    setFrontImageFile(file);
    if (frontImagePreview) URL.revokeObjectURL(frontImagePreview);
    setFrontImagePreview(URL.createObjectURL(file));
  };

  const handleBackImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidImageFile(file)) {
      toast.error("Tipo de arquivo não suportado. Use PNG, JPEG ou WebP.");
      return;
    }

    setBackImageFile(file);
    if (backImagePreview) URL.revokeObjectURL(backImagePreview);
    setBackImagePreview(URL.createObjectURL(file));
  };

  const removeFrontImage = () => {
    setFrontImageFile(null);
    if (frontImagePreview) URL.revokeObjectURL(frontImagePreview);
    setFrontImagePreview(null);
  };

  const removeBackImage = () => {
    setBackImageFile(null);
    if (backImagePreview) URL.revokeObjectURL(backImagePreview);
    setBackImagePreview(null);
  };

  const handleCriarNovaColecao = async () => {
    if (!novoDeckNome.trim()) return;
    try {
      await createDeck(novoDeckNome.trim(), aulaDisciplina || "Aulas");
      toast.success("Baralho criado com sucesso!");
      setNovoDeckNome("");
      setShowNovaColecao(false);
      if (decks.length > 0) {
        setDeckId(decks[decks.length - 1].id);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar baralho");
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) {
      toast.error("Preencha a frente e o verso do flashcard.");
      return;
    }

    if (!userId) {
      toast.error("Usuário não autenticado. Faça login para criar flashcards com imagem.");
      return;
    }

    let targetDeckId = deckId;
    if (!targetDeckId && decks.length > 0) {
      targetDeckId = decks[0].id;
    }

    if (!targetDeckId) {
      toast.error("Crie ou selecione um baralho primeiro.");
      return;
    }

    setIsSaving(true);
    let frontImageUrl: string | null = null;
    let backImageUrl: string | null = null;

    try {
      // Upload da imagem da frente se houver
      if (frontImageFile) {
        setIsUploadingImage(true);
        try {
          frontImageUrl = await compressAndUploadImage(frontImageFile, userId);
        } catch (uploadError) {
          console.error('❌ Falha no upload da imagem da frente:', uploadError);
          toast.error("Falha ao enviar imagem da frente. O flashcard não foi salvo.");
          return;
        }
        setIsUploadingImage(false);
      }

      // Upload da imagem do verso se houver
      if (backImageFile) {
        setIsUploadingImage(true);
        try {
          backImageUrl = await compressAndUploadImage(backImageFile, userId);
        } catch (uploadError) {
          console.error('❌ Falha no upload da imagem do verso:', uploadError);
          // Se o upload da frente funcionou, apagar a imagem órfã
          if (frontImageUrl) {
            await deleteFlashcardImage(frontImageUrl);
          }
          toast.error("Falha ao enviar imagem do verso. O flashcard não foi salvo.");
          return;
        }
        setIsUploadingImage(false);
      }

      // Salvar o card com as URLs das imagens
      await addCard(targetDeckId, front.trim(), back.trim(), undefined, frontImageUrl, backImageUrl);
      toast.success("Flashcard criado com sucesso!");
      setFront("");
      setBack("");
      removeFrontImage();
      removeBackImage();
      handleClose();
    } catch (err) {
      console.error(err);
      // Se salvou o card mas falhou em algo posterior, tentar limpar imagens
      if (frontImageUrl) {
        await deleteFlashcardImage(frontImageUrl);
      }
      if (backImageUrl) {
        await deleteFlashcardImage(backImageUrl);
      }
      toast.error("Erro ao salvar flashcard");
    } finally {
      setIsSaving(false);
      setIsUploadingImage(false);
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
            onClick={handleClose}
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

          {/* Upload de imagem da frente */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-1.5">
              Imagem da frente (opcional)
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFrontImageChange}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary transition-colors file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                disabled={isUploadingImage}
              />
              {frontImagePreview && (
                <div className="relative group inline-block">
                  <img
                    src={frontImagePreview}
                    alt="Preview da frente"
                    className="max-w-full h-auto rounded-lg border border-border max-h-48 object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeFrontImage}
                    className="absolute top-1 right-1 rounded-full bg-red-500/90 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    aria-label="Remover imagem"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <span className="mt-1 block text-[11px] text-foreground/40">PNG, JPEG ou WebP • máx. 0.5 MB após compressão</span>
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

          {/* Upload de imagem do verso */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-1.5">
              Imagem do verso (opcional)
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleBackImageChange}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary transition-colors file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                disabled={isUploadingImage}
              />
              {backImagePreview && (
                <div className="relative group inline-block">
                  <img
                    src={backImagePreview}
                    alt="Preview do verso"
                    className="max-w-full h-auto rounded-lg border border-border max-h-48 object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeBackImage}
                    className="absolute top-1 right-1 rounded-full bg-red-500/90 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    aria-label="Remover imagem"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <span className="mt-1 block text-[11px] text-foreground/40">PNG, JPEG ou WebP • máx. 0.5 MB após compressão</span>
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
              onClick={handleClose}
              className="rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploadingImage}
              className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2 shadow-md"
            >
              {isSaving ? "Salvando..." : isUploadingImage ? "Enviando imagem..." : "Salvar flashcard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}