// src/components/EditarQuestaoModal.tsx
import { useState, useEffect } from "react";
import {
  criarQuestaoNaLista,
  atualizarQuestaoLista,
  buscarQuestao,
  uploadImagemQuestao,
  fileToBase64,
} from "@/services/listaService";
import { QuestaoLista, TipoQuestaoLista, AlternativaLista } from "@/lib/listas-types";
import {
  X, Loader2, CheckCircle2, Trash2, Plus, Image as ImageIcon, Upload,
} from "lucide-react";

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
type Letra = typeof LETRAS[number];

interface Props {
  modo: 'criar' | 'editar';
  listaId: string;
  userId: string;
  disciplineId: string;
  questaoId?: string; // só no modo 'editar'
  onClose: () => void;
  onSuccess: () => void;
}

export function EditarQuestaoModal({
  modo,
  listaId,
  userId,
  disciplineId,
  questaoId,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(modo === 'editar');
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  // Campos
  const [tipo, setTipo] = useState<TipoQuestaoLista>('multipla_escolha');
  const [enunciado, setEnunciado] = useState("");
  const [area, setArea] = useState("");
  const [comentarioGeral, setComentarioGeral] = useState("");
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [imagemRemovida, setImagemRemovida] = useState(false);

  const [gabaritoCE, setGabaritoCE] = useState(true);

  const [alternativas, setAlternativas] = useState<AlternativaLista[]>([
    { letra: 'A', texto: '', correta: false, comentario: null },
    { letra: 'B', texto: '', correta: false, comentario: null },
    { letra: 'C', texto: '', correta: false, comentario: null },
    { letra: 'D', texto: '', correta: false, comentario: null },
  ]);

  // ============================================================
  // CARREGAR QUESTÃO (modo editar)
  // ============================================================
  useEffect(() => {
    if (modo === 'criar' || !questaoId) return;

    const load = async () => {
      setLoading(true);
      const result = await buscarQuestao(questaoId, userId);
      if (!result.success || !result.data) {
        setError(result.error || 'Questão não encontrada');
        setLoading(false);
        return;
      }
      const q: QuestaoLista = result.data;
      setTipo(q.tipo);
      setEnunciado(q.enunciado);
      setArea(q.area || '');
      setComentarioGeral(q.comentario_geral || '');
      setImagemUrl(q.imagem_url);
      setImagemPreview(q.imagem_url);
      setGabaritoCE(q.gabarito_ce ?? true);
      if (q.alternativas && q.alternativas.length > 0) {
        setAlternativas(q.alternativas);
      }
      setLoading(false);
    };
    load();
  }, [modo, questaoId, userId]);

  // ============================================================
  // ALTERNATIVAS
  // ============================================================
  const adicionarAlternativa = () => {
    if (alternativas.length >= 5) return;
    const proximaLetra = LETRAS[alternativas.length];
    setAlternativas([...alternativas, { letra: proximaLetra, texto: '', correta: false, comentario: null }]);
  };

  const removerAlternativa = (index: number) => {
    if (alternativas.length <= 2) return;
    const novas = alternativas.filter((_, i) => i !== index).map((a, i) => ({
      ...a,
      letra: LETRAS[i],
    }));
    setAlternativas(novas);
  };

  const atualizarAlternativa = (index: number, campo: 'texto' | 'comentario', valor: string) => {
    const novas = [...alternativas];
    novas[index] = { ...novas[index], [campo]: valor || null };
    setAlternativas(novas);
  };

  const marcarCorreta = (index: number) => {
    setAlternativas(alternativas.map((a, i) => ({ ...a, correta: i === index })));
  };

  // ============================================================
  // IMAGEM
  // ============================================================
  const handleImagemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Imagem maior que 2 MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formato inválido. Use JPEG, PNG ou WebP.');
      return;
    }

    setImagemFile(file);
    setImagemPreview(URL.createObjectURL(file));
    setImagemRemovida(false);
    setError(null);
  };

  const removerImagem = () => {
    setImagemFile(null);
    setImagemPreview(null);
    setImagemRemovida(true);
  };

  // ============================================================
  // SALVAR
  // ============================================================
  const handleSalvar = async () => {
    setError(null);

    if (!enunciado.trim()) {
      setError('O enunciado é obrigatório');
      return;
    }

    if (tipo === 'multipla_escolha') {
      if (alternativas.some(a => !a.texto.trim())) {
        setError('Todas as alternativas precisam de texto');
        return;
      }
      if (alternativas.filter(a => a.correta).length !== 1) {
        setError('Marque exatamente uma alternativa como correta');
        return;
      }
    }

    setSalvando(true);

    // 1. Se tem imagem nova, sobe para o Storage
    let urlFinal: string | null = imagemUrl;

    if (imagemFile) {
      const base64 = await fileToBase64(imagemFile);
      const upload = await uploadImagemQuestao(base64, userId);
      if (!upload.success) {
        setSalvando(false);
        setError('Erro ao subir imagem: ' + upload.error);
        return;
      }
      urlFinal = upload.url || null;
    } else if (imagemRemovida) {
      urlFinal = null;
    }

    // 2. Salva a questão
    const dados = {
      tipo,
      enunciado,
      area: area || null,
      imagem_url: urlFinal,
      comentario_geral: comentarioGeral || null,
      alternativas: tipo === 'multipla_escolha' ? alternativas : null,
      gabarito_ce: tipo === 'certo_errado' ? gabaritoCE : null,
    };

    const result = modo === 'criar'
      ? await criarQuestaoNaLista(listaId, userId, disciplineId, dados)
      : await atualizarQuestaoLista(questaoId!, userId, dados);

    setSalvando(false);

    if (!result.success) {
      setError(result.error || 'Erro ao salvar questão');
      return;
    }

    setSucesso(true);
    setTimeout(() => onSuccess(), 800);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface max-h-[92vh] overflow-y-auto shadow-elevated">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <h3 className="text-lg font-semibold">
            {modo === 'criar' ? 'Nova questão' : 'Editar questão'}
          </h3>
          <button
            onClick={onClose}
            className="text-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sucesso ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <p className="mt-3 text-sm font-medium">
              {modo === 'criar' ? 'Questão adicionada!' : 'Questão atualizada!'}
            </p>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            {/* Tipo — só editável no modo criar */}
            <div>
              <label className="text-sm font-medium text-foreground/70">Tipo de questão *</label>
              {modo === 'criar' ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipo('multipla_escolha')}
                    className={[
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      tipo === 'multipla_escolha'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground/60 hover:bg-surface-2",
                    ].join(" ")}
                  >
                    Múltipla escolha
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('certo_errado')}
                    className={[
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      tipo === 'certo_errado'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground/60 hover:bg-surface-2",
                    ].join(" ")}
                  >
                    Certo / Errado
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-foreground/60">
                  {tipo === 'multipla_escolha' ? 'Múltipla escolha' : 'Certo / Errado'}
                  <span className="ml-2 text-[11px] text-foreground/40">
                    (o tipo não pode ser alterado depois de criado)
                  </span>
                </p>
              )}
            </div>

            {/* Enunciado */}
            <div>
              <label className="text-sm font-medium text-foreground/70">Enunciado *</label>
              <textarea
                value={enunciado}
                onChange={(e) => setEnunciado(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary resize-y"
                placeholder="Digite o enunciado da questão"
              />
            </div>

            {/* Área */}
            <div>
              <label className="text-sm font-medium text-foreground/70">Área</label>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                placeholder="Ex: Saúde Coletiva (opcional)"
              />
            </div>

            {/* Imagem */}
            <div>
              <label className="text-sm font-medium text-foreground/70 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Imagem
              </label>
              {imagemPreview ? (
                <div className="mt-2 space-y-2">
                  <img
                    src={imagemPreview}
                    alt="Prévia"
                    className="max-h-48 rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={removerImagem}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/65 hover:text-accent hover:border-accent/40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover imagem
                  </button>
                </div>
              ) : (
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-foreground/50 hover:border-primary hover:text-primary transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  Selecionar imagem (JPEG, PNG ou WebP, máx. 2 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImagemChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Múltipla escolha — alternativas */}
            {tipo === 'multipla_escolha' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground/70">
                    Alternativas * <span className="text-[11px] text-foreground/40">(marque a correta)</span>
                  </label>
                  {alternativas.length < 5 && (
                    <button
                      type="button"
                      onClick={adicionarAlternativa}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:opacity-80"
                    >
                      <Plus className="h-3 w-3" /> Adicionar
                    </button>
                  )}
                </div>

                <div className="mt-2 space-y-2">
                  {alternativas.map((alt, i) => (
                    <div
                      key={i}
                      className={[
                        "rounded-lg border p-3 transition-colors",
                        alt.correta
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-background",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => marcarCorreta(i)}
                          className={[
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors",
                            alt.correta
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-foreground/55 hover:border-primary hover:text-primary",
                          ].join(" ")}
                          title="Marcar como correta"
                        >
                          {alt.letra}
                        </button>
                        <div className="min-w-0 flex-1 space-y-2">
                          <textarea
                            value={alt.texto}
                            onChange={(e) => atualizarAlternativa(i, 'texto', e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-primary resize-y"
                            placeholder={`Texto da alternativa ${alt.letra}`}
                          />
                          <input
                            type="text"
                            value={alt.comentario || ''}
                            onChange={(e) => atualizarAlternativa(i, 'comentario', e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                            placeholder="Comentário/justificativa (opcional)"
                          />
                        </div>
                        {alternativas.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removerAlternativa(i)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-foreground/30 hover:text-accent transition-colors"
                            title="Remover alternativa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certo/Errado — gabarito */}
            {tipo === 'certo_errado' && (
              <div>
                <label className="text-sm font-medium text-foreground/70">Gabarito *</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGabaritoCE(true)}
                    className={[
                      "rounded-lg border px-3 py-3 text-sm font-semibold transition-colors",
                      gabaritoCE
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground/60 hover:bg-surface-2",
                    ].join(" ")}
                  >
                    Certo
                  </button>
                  <button
                    type="button"
                    onClick={() => setGabaritoCE(false)}
                    className={[
                      "rounded-lg border px-3 py-3 text-sm font-semibold transition-colors",
                      !gabaritoCE
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground/60 hover:bg-surface-2",
                    ].join(" ")}
                  >
                    Errado
                  </button>
                </div>
              </div>
            )}

            {/* Comentário geral */}
            <div>
              <label className="text-sm font-medium text-foreground/70">Comentário geral</label>
              <textarea
                value={comentarioGeral}
                onChange={(e) => setComentarioGeral(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary resize-y"
                placeholder="Gabarito comentado (opcional)"
              />
            </div>

            {/* Erro */}
            {error && (
              <div className="rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
                {error}
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={salvando}
                className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvar}
                disabled={salvando}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (modo === 'criar' ? 'Adicionar' : 'Salvar')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}