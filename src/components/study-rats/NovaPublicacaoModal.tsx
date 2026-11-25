import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, Camera, ChevronLeft, ChevronRight, Clock, Lightbulb, Loader2, RotateCcw, X } from "lucide-react";
import { useStudyRatsCheckins } from "@/contexts/StudyRatsContext";
import { getDisciplinesLocal } from "@/lib/disciplinesLocal";
import { createPost, updatePost } from "@/services/studyRatsService";
import { invalidateStudyFeedCache } from "@/hooks/useStudyRats";
import { STUDY_RATS } from "@/constants";
import { fmtDuracao } from "@/utils/studyRatsFormat";
import { uid } from "@/utils/helpers";
import type { StudyPost } from "@/types/studyRats";

type TipoPublicacao = "checkin" | "post";
type Destino = "feed" | "story";
type Categoria = "study_tip" | "curiosity" | "question" | "motivation";

interface NovaPublicacaoModalProps {
  onClose: () => void;
  onPublicado?: () => void;
  tipoInicial?: TipoPublicacao | "escolher";
  editPost?: StudyPost | null;
}

interface Disciplina {
  id: string;
  name: string;
}

export function NovaPublicacaoModal({ onClose, onPublicado, tipoInicial, editPost }: NovaPublicacaoModalProps) {
  const isEditing = !!editPost;
  const [tipo, setTipo] = useState<TipoPublicacao | "escolher" | undefined>(isEditing ? editPost?.kind : (tipoInicial === "escolher" ? undefined : tipoInicial));
  const [fotos, setFotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [materia, setMateria] = useState<string>(isEditing && editPost?.kind === "checkin" ? editPost?.subject ?? "" : "");
  const [categoria, setCategoria] = useState<Categoria>(isEditing && editPost?.kind === "post" ? (editPost?.category as Categoria) : "study_tip");
  const [duracao, setDuracao] = useState(isEditing && editPost?.kind === "checkin" ? editPost?.durationMin : 60);
  const [legenda, setLegenda] = useState(isEditing ? (editPost?.caption ?? "") : "");
  const [destino, setDestino] = useState<Destino>(isEditing ? (editPost?.inFeed ? "feed" : "story") : "feed");
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [loadingDisciplinas, setLoadingDisciplinas] = useState(true);
  const [erroDisciplinas, setErroDisciplinas] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarCamera, setMostrarCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("environment");
  const [cameraIndisponivel, setCameraIndisponivel] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewsRef = useRef<string[]>([]);
  const fotosRef = useRef<File[]>([]);
  const erroTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRequestIdRef = useRef<number>(0);
  const adicionarFotoRef = useRef<(file: File) => void>(() => {});

  const { userId, createCheckin, updateCheckin } = useStudyRatsCheckins();

  const maxFotos = tipo === "post" && destino === "story" ? 1 : STUDY_RATS.LIMITES.MAX_FOTOS;
  const podePublicar = isEditing
    ? tipo === "checkin"
      ? Boolean(materia) && duracao > 0
      : legenda.trim().length > 0 && Boolean(categoria)
    : tipo === "checkin"
      ? fotos.length > 0 && materia && duracao > 0
      : destino === "story"
        ? fotos.length === 1 && legenda.trim().length > 0 && categoria
        : legenda.trim().length > 0 && categoria;

  // Função única para mostrar erro com timeout
  const mostrarErro = useCallback((msg: string) => {
    if (erroTimeoutRef.current) clearTimeout(erroTimeoutRef.current);
    setErro(msg);
    erroTimeoutRef.current = setTimeout(() => setErro(null), 3000);
  }, []);

  // Validar e adicionar foto
  const adicionarFoto = useCallback((file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      mostrarErro("Formato não suportado. Use JPG, PNG ou WebP.");
      return;
    }

    if (fotosRef.current.length >= maxFotos) {
      mostrarErro(`Máximo de ${maxFotos} foto(s).`);
      return;
    }

    if (file.size > STUDY_RATS.LIMITES.MAX_ARQUIVO_MB * 1024 * 1024) {
      mostrarErro(`Cada foto pode ter no máximo ${STUDY_RATS.LIMITES.MAX_ARQUIVO_MB} MB.`);
      return;
    }

    const preview = URL.createObjectURL(file);
    setFotos(prev => [...prev, file]);
    setPreviews(prev => [...prev, preview]);
  }, [maxFotos, mostrarErro]);

  // Sincronizar ref do adicionarFoto
  useEffect(() => { adicionarFotoRef.current = adicionarFoto; }, [adicionarFoto]);

  // Outros efeitos de sincronização de refs e dados
  useEffect(() => { previewsRef.current = previews; }, [previews]);
  useEffect(() => { fotosRef.current = fotos; }, [fotos]);
  useEffect(() => { streamRef.current = cameraStream; }, [cameraStream]);

  // Quando mudar para story e houver mais de 1 foto, cortar para a primeira
  useEffect(() => {
    if (destino === "story" && tipo === "post" && fotos.length > 1) {
      const extras = fotos.slice(1);
      extras.forEach((_, i) => URL.revokeObjectURL(previews[i + 1]));
      setFotos([fotos[0]]);
      setPreviews([previews[0]]);
    }
  }, [destino, tipo, fotos.length, previews.length]);

  // Carregar disciplinas da usuária (RxDB local, mesma fonte da aba Disciplinas)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadingDisciplinas(true);
    setErroDisciplinas(null);
    getDisciplinesLocal(userId).then(result => {
      if (cancelled) return;
      if (result.success) {
        setDisciplinas(result.data ?? []);
      } else {
        setErroDisciplinas(result.error ?? "Não foi possível carregar as disciplinas.");
      }
      setLoadingDisciplinas(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Pré-seleciona a primeira disciplina quando a lista chega (sem refazer a busca)
  useEffect(() => {
    if (!materia && disciplinas.length > 0) {
      setMateria(disciplinas[0].name);
    }
  }, [disciplinas, materia]);

  // Limpar previews e stream ao fechar
  useEffect(() => {
    return () => {
      cameraRequestIdRef.current += 1;
      previewsRef.current.forEach(url => URL.revokeObjectURL(url));
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (erroTimeoutRef.current) clearTimeout(erroTimeoutRef.current);
    };
  }, []);

  // Função única para parar stream
  const pararStream = useCallback(() => {
    cameraRequestIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    setMostrarCamera(false);
  }, []);

  // Abrir câmera nativa do aparelho (fallback)
  const abrirCameraDoAparelho = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("capture", "environment");
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files[0]) {
        adicionarFotoRef.current(files[0]);
      }
    };
    input.click();
  }, []);

  // Iniciar câmera
  const iniciarCamera = useCallback(async (modo: "user" | "environment" = cameraFacingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      mostrarErro("Não foi possível abrir a câmera. Você pode escolher uma foto da galeria.");
      setCameraIndisponivel(true);
      return;
    }

    const requestId = ++cameraRequestIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: modo, width: { ideal: 1080 }, height: { ideal: 1080 } },
      });
      if (requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      setCameraStream(stream);
      streamRef.current = stream;
      setMostrarCamera(true);
      setCameraIndisponivel(false);
    } catch (err) {
      if (requestId !== cameraRequestIdRef.current) return;
      const msg = err instanceof Error ? err.message : "Erro ao acessar câmera";
      console.warn("Câmera não disponível:", msg);
      mostrarErro("Não foi possível abrir a câmera. Você pode escolher uma foto da galeria.");
      setCameraIndisponivel(true);
    }
  }, [cameraFacingMode, mostrarErro]);

  // useEffect para atribuir stream ao video quando ambos existirem
  useEffect(() => {
    if (mostrarCamera && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [mostrarCamera, cameraStream]);

  // Capturar foto da câmera
  const capturarFoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (video.videoWidth === 0) {
      mostrarErro("A câmera ainda está iniciando. Tente de novo.");
      return;
    }

    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;

    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera-${uid()}.jpg`, { type: "image/jpeg" });
        adicionarFotoRef.current(file);
      }
    }, "image/jpeg", 0.9);

    pararStream();
  }, [mostrarErro, pararStream]);

  // Alternar câmera frontal/traseira
  const alternarCamera = useCallback(() => {
    const novoModo = cameraFacingMode === "environment" ? "user" : "environment";
    setCameraFacingMode(novoModo);
    pararStream();
    iniciarCamera(novoModo);
  }, [cameraFacingMode, pararStream, iniciarCamera]);

  // Adicionar foto da galeria
  const adicionarFotoDaGaleria = useCallback(() => {
    const espaco = maxFotos - fotosRef.current.length;
    if (espaco <= 0) {
      mostrarErro(`Máximo de ${maxFotos} foto(s).`);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      const espacoAtual = maxFotos - fotosRef.current.length;
      if (files.length > espacoAtual) {
        mostrarErro(`Só cabem ${espacoAtual} foto(s).`);
      }
      for (const file of files.slice(0, espacoAtual)) {
        adicionarFotoRef.current(file);
      }
    };
    input.click();
  }, [maxFotos, mostrarErro]);

  // Remover foto
  const removerFoto = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFotos(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  }, [previews]);

  // Reordenar fotos
  const moverFoto = useCallback((fromIndex: number, toIndex: number) => {
    setFotos(prev => {
      const novo = [...prev];
      const [removido] = novo.splice(fromIndex, 1);
      novo.splice(toIndex, 0, removido);
      return novo;
    });
    setPreviews(prev => {
      const novo = [...prev];
      const [removido] = novo.splice(fromIndex, 1);
      novo.splice(toIndex, 0, removido);
      return novo;
    });
  }, []);

  // Publicar
  const handlePublicar = useCallback(async () => {
    if (!tipo || !podePublicar || publicando) return;
    if (!userId) {
      setErro("Usuário não autenticado.");
      return;
    }

    setPublicando(true);
    setErro(null);

    try {
      if (isEditing && editPost) {
        if (tipo === "checkin") {
          await updateCheckin(editPost.id, {
            subject: materia,
            durationMin: duracao,
            caption: legenda.trim(),
          });
        } else {
          await updatePost(editPost.id, {
            category: categoria,
            caption: legenda.trim(),
          });
        }
      } else {
        if (tipo === "checkin") {
          await createCheckin({
            destination: destino,
            kind: STUDY_RATS.TIPOS.CHECKIN,
            subject: materia,
            durationMin: duracao,
            caption: legenda.trim() || undefined,
            files: fotos,
          });
        } else {
          await createPost({
            destination: destino,
            kind: STUDY_RATS.TIPOS.POST,
            category: categoria,
            caption: legenda.trim(),
            files: fotos,
          });
        }
      }

      invalidateStudyFeedCache();
      onPublicado?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao publicar";
      setErro(msg);
    } finally {
      setPublicando(false);
    }
  }, [tipo, podePublicar, publicando, userId, isEditing, editPost, updateCheckin, materia, duracao, legenda, categoria, fotos, destino, createCheckin, createPost, onPublicado, onClose]);

  // Renderização
  if (!tipo) {
    return (
      <div className="srx-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
        <div className="srx-sheet srx-card max-h-[92vh] w-full max-w-md overflow-y-auto rounded-b-none sm:rounded-b-[1.5rem]" onClick={(e) => e.stopPropagation()}>
          <header className="sticky top-0 z-10 flex items-center border-b border-border bg-surface px-4 py-3">
            <button aria-label="Fechar" onClick={onClose} className="text-muted-foreground"><X className="h-5 w-5" /></button>
            <h3 className="mx-auto text-sm font-bold text-foreground">Criar</h3>
            <span className="w-5" />
          </header>
          <div className="space-y-3 p-4">
            <p className="text-center text-sm text-muted-foreground">O que você quer compartilhar?</p>
            {([
              ["checkin", CalendarCheck, "Check-in de estudo", "Foto da sessão, matéria e tempo. Vai para o seu calendário."],
              ["post", Lightbulb, "Publicação", "Dica de estudo, curiosidade, dúvida ou motivação. Fica no feed e no perfil."],
            ] as const).map(([k, I, t, d]) => (
              <button
                key={k}
                onClick={() => setTipo(k as TipoPublicacao)}
                className="flex w-full items-center gap-4 rounded-2xl border border-border bg-surface-2 p-4 text-left transition hover:border-accent"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground"><I className="h-6 w-6" /></span>
                <span><b className="block text-foreground">{t}</b><span className="text-xs text-muted-foreground">{d}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const categorias: { value: Categoria; label: string; emoji: string }[] = [
    { value: "study_tip", label: "Dica de estudo", emoji: "💡" },
    { value: "curiosity", label: "Curiosidade", emoji: "🔎" },
    { value: "question", label: "Dúvida", emoji: "❓" },
    { value: "motivation", label: "Motivação", emoji: "🔥" },
  ];

  return (
    <div className="srx-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={publicando ? undefined : onClose}>
      <div className="srx-sheet srx-card max-h-[92vh] w-full max-w-md overflow-y-auto rounded-b-none sm:rounded-b-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center border-b border-border bg-surface px-4 py-3">
          <button
            aria-label="Fechar"
            onClick={() => {
              if (isEditing) {
                onClose();
              } else if (tipoInicial === "escolher" || tipoInicial === undefined) {
                setTipo(undefined);
              } else {
                onClose();
              }
            }}
            disabled={publicando}
            className="text-muted-foreground disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
          <h3 className="mx-auto text-sm font-bold text-foreground">
            {isEditing ? (tipo === "checkin" ? "Editar check-in" : "Editar publicação") : (tipo === "checkin" ? "Check-in de estudo" : "Nova publicação")}
          </h3>
          {tipo ? (
            <button
              onClick={handlePublicar}
              disabled={!podePublicar || publicando}
              className="text-sm font-bold text-accent disabled:opacity-40"
            >
              {publicando ? <> <Loader2 className="h-4 w-4 animate-spin mr-1" /> Salvando… </> : isEditing ? "Salvar" : (destino === "story" ? "Compartilhar" : "Publicar")}
            </button>
          ) : (
            <span className="w-5" />
          )}
        </header>

        {tipo && !isEditing && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Publicar em</span>
            <div className="srx-seg ml-auto">
              <button data-on={destino === "feed"} onClick={() => setDestino("feed")}>Feed · para sempre</button>
              <button data-on={destino === "story"} onClick={() => setDestino("story")}>Stories · 24h</button>
            </div>
          </div>
        )}

        {erro && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {erro}
          </div>
        )}

        {tipo === "checkin" && erroDisciplinas && !loadingDisciplinas && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            Não foi possível carregar suas disciplinas. Tente fechar e abrir de novo.
          </div>
        )}

        {tipo === "checkin" && !erroDisciplinas && disciplinas.length === 0 && !loadingDisciplinas && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-surface-2 text-sm text-muted-foreground">
            Cadastre uma matéria em Disciplinas para fazer check-in.
          </div>
        )}

        {tipo === "checkin" && (
          <>
            {/* Seletor de fotos */}
            <div className="p-4 space-y-3">
              {/* Preview das fotos */}
              {previews.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {previews.map((preview, i) => (
                    <div key={i} className="relative shrink-0">
                      <div className="relative aspect-square w-24 rounded-xl overflow-hidden bg-surface-2">
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                        {!isEditing && (
                          <button
                            onClick={() => removerFoto(i)}
                            className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground/70 hover:bg-background"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!isEditing && previews.length > 1 && (
                          <div className="absolute bottom-1 left-1 flex gap-1">
                            {i > 0 && <button onClick={() => moverFoto(i, i - 1)} className="srx-icon p-1 bg-background/80 rounded-full" aria-label="Mover para a esquerda"><ChevronLeft className="h-3.5 w-3.5" /></button>}
                            {i < previews.length - 1 && <button onClick={() => moverFoto(i, i + 1)} className="srx-icon p-1 bg-background/80 rounded-full" aria-label="Mover para a direita"><ChevronRight className="h-3.5 w-3.5" /></button>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {previews.length < maxFotos && !isEditing && (
                    <>
                    <button onClick={cameraIndisponivel ? abrirCameraDoAparelho : () => iniciarCamera()} className="flex shrink-0 items-center justify-center aspect-square w-24 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted-foreground" disabled={publicando}>
                      <Camera className="h-6 w-6" />
                    </button>
                    <button onClick={adicionarFotoDaGaleria} className="flex shrink-0 items-center justify-center aspect-square w-24 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted-foreground" disabled={publicando}>
                      <Lightbulb className="h-6 w-6" />
                    </button>
                    </>
                  )}
                </div>
              )}

              {/* Botões de câmera/galeria quando não há fotos */}
              {previews.length === 0 && !isEditing && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={cameraIndisponivel ? abrirCameraDoAparelho : () => iniciarCamera()}
                    disabled={publicando}
                    className="relative aspect-square cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface-2 p-4 flex flex-col items-center gap-2 text-sm transition hover:border-accent"
                  >
                    <Camera className="h-10 w-10 text-accent" />
                    <span>{cameraIndisponivel ? "Câmera do aparelho" : "Tirar foto"}</span>
                    {publicando && <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl"><Loader2 className="h-5 w-5 animate-spin" /></div>}
                  </button>
                  <button
                    onClick={adicionarFotoDaGaleria}
                    disabled={publicando}
                    className="relative aspect-square cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface-2 p-4 flex flex-col items-center gap-2 text-sm transition hover:border-accent"
                  >
                    <Lightbulb className="h-10 w-10 text-accent" />
                    <span>Galeria</span>
                  </button>
                </div>
              )}

              {/* Matérias */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">Matéria</label>
                {loadingDisciplinas ? (
                  <div className="flex gap-2"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Carregando…</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {disciplinas.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setMateria(d.name)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${materia === d.name ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted-foreground"}`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Duração */}
              <label className="flex items-center gap-3 text-sm text-foreground">
                <Clock className="h-4 w-4 text-accent" /> Tempo
                <input type="range" min={15} max={300} step={15} value={duracao} onChange={(e) => setDuracao(+e.target.value)} className="flex-1 accent-[var(--accent)]" disabled={publicando} />
                <b className="w-16 text-right">{fmtDuracao(duracao)}</b>
              </label>

              {/* Legenda */}
              <textarea
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                rows={2}
                placeholder="Como foi a sessão? (opcional)"
                className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm text-foreground resize-none"
                disabled={publicando}
              />
            </div>
          </>
        )}

        {tipo === "post" && (
          <div className="p-4 space-y-3">
            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2">Categoria</label>
              <div className="flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategoria(c.value)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${categoria === c.value ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted-foreground"}`}
                    disabled={publicando}
                  >
                    <span>{c.emoji}</span> {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fotos (máx 1 para story) */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2">
                Foto {destino === "story" ? "(máx. 1)" : `(máx. ${STUDY_RATS.LIMITES.MAX_FOTOS})`}
              </label>
              {previews.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {previews.map((preview, i) => (
                    <div key={i} className="relative shrink-0">
                      <div className="relative aspect-square w-24 rounded-xl overflow-hidden bg-surface-2">
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                        {!isEditing && (
                          <button
                            onClick={() => removerFoto(i)}
                            className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground/70 hover:bg-background"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {previews.length < maxFotos && !isEditing && (
                    <>
                    <button onClick={cameraIndisponivel ? abrirCameraDoAparelho : () => iniciarCamera()} className="flex shrink-0 items-center justify-center aspect-square w-24 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted-foreground" disabled={publicando}>
                      <Camera className="h-6 w-6" />
                    </button>
                    <button onClick={adicionarFotoDaGaleria} className="flex shrink-0 items-center justify-center aspect-square w-24 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted-foreground" disabled={publicando}>
                      <Lightbulb className="h-6 w-6" />
                    </button>
                    </>
                  )}
                </div>
              )}

              {previews.length === 0 && !isEditing && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={cameraIndisponivel ? abrirCameraDoAparelho : () => iniciarCamera()}
                    disabled={publicando}
                    className="relative aspect-square cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface-2 p-4 flex flex-col items-center gap-2 text-sm transition hover:border-accent"
                  >
                    <Camera className="h-10 w-10 text-accent" />
                    <span>{cameraIndisponivel ? "Câmera do aparelho" : "Tirar foto"}</span>
                  </button>
                  <button
                    onClick={adicionarFotoDaGaleria}
                    disabled={publicando}
                    className="relative aspect-square cursor-pointer rounded-2xl border-2 border-dashed border-border bg-surface-2 p-4 flex flex-col items-center gap-2 text-sm transition hover:border-accent"
                  >
                    <Lightbulb className="h-10 w-10 text-accent" />
                    <span>Galeria</span>
                  </button>
                </div>
              )}
            </div>

            {/* Legenda */}
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              rows={4}
              placeholder={categorias.find(c => c.value === categoria)?.label === "Dica de estudo" ? "Compartilhe sua dica…" : "Escreva aqui…"}
              className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm text-foreground resize-none"
              maxLength={STUDY_RATS.LIMITES.MAX_LEGENDA}
              disabled={publicando}
            />
            <p className="text-right text-xs text-muted-foreground">{legenda.length}/{STUDY_RATS.LIMITES.MAX_LEGENDA}</p>
          </div>
        )}

        {/* Modal de câmera */}
        {mostrarCamera && (
          <div className="srx-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={pararStream}>
            <div className="srx-sheet srx-card relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <header className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Câmera</span>
                <button onClick={pararStream} className="text-muted-foreground"><X className="h-5 w-5" /></button>
              </header>
              <div className="relative aspect-square bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ transform: cameraFacingMode === "user" ? "scaleX(-1)" : "none" }}
                />
                <canvas ref={canvasRef} className="hidden" />
                {/* Guia quadrado central */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[80%] aspect-square border-2 border-white/50 rounded-xl" />
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-4 gap-4">
                <button onClick={alternarCamera} className="srx-fab flex-1 flex items-center justify-center gap-2 rounded-full py-2 text-sm font-bold">
                  <RotateCcw className="h-4 w-4" /> Trocar
                </button>
                <button onClick={capturarFoto} className="srx-fab flex-1 flex items-center justify-center gap-2 rounded-full py-2 text-sm font-bold">
                  <Camera className="h-4 w-4" /> Capturar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}