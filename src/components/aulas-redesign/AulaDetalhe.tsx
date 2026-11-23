// src/components/aulas-redesign/AulaDetalhe.tsx
// Tela 3 — página da aula: cabeçalho, ações, player real, vídeo/download e material de apoio.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  HardDrive,
  Heart,
  Layers,
  ListVideo,
  Loader2,
  Play,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { getPlayableObjectUrl } from "@/services/videoOfflineService";
import { useToast } from "@/hooks/useToast";
import { AulaPlayer } from "../aulas/AulaPlayer";
import { AulaMateriais } from "../aulas/AulaMateriais";
import { VideoOfflineButton } from "../aulas/VideoOfflineButton";
import { CriarFlashcardAulaModal } from "../CriarFlashcardAulaModal";
import { aulaEhNova, useAulasData } from "./AulasDataContext";
import { AulasRedesignStyles } from "./AulasRedesignStyles";
import { localizarAula, resumirTopicos } from "./topicosUtils";

// Nome do arquivo no download do vídeo: sem \ / : * ? " < > | e com até 120 caracteres.
function nomeSeguroArquivo(titulo: string): string {
  const limpo = (titulo || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (limpo || "aula").slice(0, 120);
}

export function AulaDetalhe() {
  const { disciplinaId, aulaId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const {
    loading,
    isOnline,
    getDisciplina,
    offlineAulaIds,
    tempos,
    toggleConcluida,
    marcarConcluida,
    playlist,
    encerrarPlaylist,
    toggleFavorita,
    handleTimeUpdate,
    gravarProgressoAgora,
    aulaAtivaRef,
    setVideosOfflineAberto,
  } = useAulasData();

  const disciplina = getDisciplina(disciplinaId);
  const index = disciplina ? disciplina.aulas.findIndex((a) => a.id === aulaId) : -1;
  const aula = index >= 0 && disciplina ? disciplina.aulas[index] : null;

  const [flashcardAberto, setFlashcardAberto] = useState(false);
  const [offlineSource, setOfflineSource] = useState<{ aulaId: string; url: string | null } | null>(null);
  const materiaisRef = useRef<HTMLDivElement>(null);

  const idDaAula = aula?.id ?? null;

  // Marca a aula aberta (para o aviso de "vídeo salvo") e grava o progresso ao sair.
  useEffect(() => {
    if (!idDaAula) return;
    aulaAtivaRef.current = idDaAula;
    return () => {
      gravarProgressoAgora(idDaAula);
      if (aulaAtivaRef.current === idDaAula) aulaAtivaRef.current = null;
    };
  }, [idDaAula, aulaAtivaRef, gravarProgressoAgora]);

  // Se o vídeo foi baixado, toca a cópia do aparelho.
  useEffect(() => {
    setOfflineSource(null);
    if (!idDaAula) return;
    let cancelled = false;
    let urlCriado: string | null = null;
    getPlayableObjectUrl(idDaAula).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      urlCriado = url;
      setOfflineSource({ aulaId: idDaAula, url });
    });
    return () => {
      cancelled = true;
      if (urlCriado) {
        URL.revokeObjectURL(urlCriado);
        urlCriado = null;
      }
    };
  }, [idDaAula]);

  if (loading) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!disciplina || !aula) {
    return (
      <div className="mx-auto w-full max-w-5xl py-2 sm:py-4">
        <AulasRedesignStyles />
        <Link
          to={disciplina ? `/aulas/${disciplina.slug}` : "/aulas"}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {disciplina ? disciplina.nome : "Todas as disciplinas"}
        </Link>
        <p className="rfx-card p-6 text-sm text-muted-foreground">Aula não encontrada.</p>
      </div>
    );
  }

  const baixada = offlineAulaIds.has(aula.id);
  const estudada = aula.concluida;
  // URL do vídeo só vale para download se for http(s) de verdade.
  const videoUrl = aula.terabox_url && /^https?:\/\//i.test(aula.terabox_url) ? aula.terabox_url : null;
  const nomeVideo = nomeSeguroArquivo(aula.titulo);

  // Lista de reprodução: só vale se ESTA aula faz parte dela; senão Próxima/Anterior seguem a disciplina.
  const aulasDaLista = playlist
    ? playlist.ids
        .map((id) => disciplina.aulas.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => !!a)
    : [];
  const posNaLista = aulasDaLista.findIndex((a) => a.id === aula.id);
  const emLista = posNaLista >= 0;
  const sequencia = emLista ? aulasDaLista : disciplina.aulas;
  const posicao = emLista ? posNaLista : index;
  const anterior = posicao > 0 ? sequencia[posicao - 1] : null;
  const proxima = posicao < sequencia.length - 1 ? sequencia[posicao + 1] : null;
  // Dentro de uma lista o vídeo seguinte já começa tocando.
  const irPara = (id: string, tocar = emLista) =>
    navigate(`/aulas/${disciplina.slug}/${id}`, { state: tocar ? { autoplay: true } : undefined });
  const tocarAutomatico = location.state?.autoplay === true;

  // Vídeo chegou ao fim: marca "Estudei" sozinho e, numa lista, passa para o próximo.
  const aoTerminar = () => {
    if (!aula.concluida) {
      marcarConcluida(aula.id);
      toast.success("Aula marcada como estudada.");
    }
    if (emLista) {
      if (proxima) irPara(proxima.id, true);
      else toast.success("Fim da lista de reprodução!");
    }
  };

  // "Voltar" leva para a lista onde a aula está (subtópico ou tópico); se não achar, para a disciplina.
  const local = localizarAula(resumirTopicos(disciplina.assuntos), aula);
  const voltar = local
    ? local.subtopico
      ? {
          to: `/aulas/${disciplina.slug}/topico/${local.topico.slug}/${local.subtopico.slug}`,
          rotulo: local.subtopico.nome,
        }
      : { to: `/aulas/${disciplina.slug}/topico/${local.topico.slug}`, rotulo: local.topico.nome }
    : { to: `/aulas/${disciplina.slug}`, rotulo: disciplina.nome };

  const acoes = [
    {
      icon: FileText,
      titulo: "Material de apoio",
      sub: "PDFs desta aula",
      onClick: () => materiaisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    },
    {
      icon: Layers,
      titulo: "Criar flashcards",
      sub: "desta aula",
      onClick: () => setFlashcardAberto(true),
    },
    {
      icon: HardDrive,
      titulo: "Vídeos offline",
      sub: "gerenciar downloads",
      onClick: () => setVideosOfflineAberto(true),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl py-2 sm:py-4" data-tone={disciplina.tone}>
      <AulasRedesignStyles />
      <Link
        to={voltar.to}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {voltar.rotulo}
      </Link>

      {emLista && playlist && (
        <div className="rfx-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
          <ListVideo className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">Lista: {playlist.nome}</p>
            <p className="text-xs text-muted-foreground">
              Aula {posNaLista + 1} de {aulasDaLista.length} · a próxima começa sozinha
            </p>
          </div>
          <button
            type="button"
            onClick={encerrarPlaylist}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <X className="h-3.5 w-3.5" /> Sair da lista
          </button>
        </div>
      )}

      <div className="rfx-topbar mb-5">
        <span style={{ width: `${aula.progresso}%` }} />
      </div>

      <section className="rfx-card p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-foreground sm:text-4xl">{aula.titulo}</h1>
              {aulaEhNova(aula.created_at) && <span className="rfx-badge-novo">novo</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {aula.assunto}
              {aula.subassunto ? ` · ${aula.subassunto}` : ""}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{aula.descricao}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => toggleConcluida(aula.id)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:text-sm"
            >
              {estudada ? "Estudei" : "Não estudei"}
              <span className="rfx-check" data-checked={estudada}>
                {estudada && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
            </button>
            {baixada && <span className="rfx-badge-baixado">baixado</span>}
            <button
              type="button"
              onClick={() => toggleFavorita(aula.id)}
              aria-label={aula.favorita ? "Desfavoritar" : "Favoritar"}
              title={aula.favorita ? "Desfavoritar" : "Favoritar"}
              className="rfx-iconbtn mt-1"
            >
              <Heart className={`h-3.5 w-3.5 ${aula.favorita ? "fill-rose-500 text-rose-500" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
          {acoes.map((a) => (
            <button
              key={a.titulo}
              type="button"
              onClick={a.onClick}
              className="rfx-card rfx-card-hover rfx-action flex flex-col items-center justify-center gap-1 px-2 pb-4 pt-6 text-center sm:gap-1.5 sm:px-4 sm:py-6"
            >
              <a.icon className="rfx-action-icon h-6 w-6 text-primary sm:h-7 sm:w-7" />
              <span className="text-xs font-semibold leading-tight text-foreground sm:text-base">{a.titulo}</span>
              <span className="text-[0.7rem] font-medium leading-tight text-accent sm:text-sm">{a.sub}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5 sm:mt-6 sm:gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            {offlineSource?.aulaId !== aula.id ? (
              <div
                className="rfx-player relative flex aspect-video w-full items-center justify-center"
                aria-live="polite"
              >
                <div className="flex flex-col items-center gap-3 text-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Preparando vídeo…</span>
                </div>
              </div>
            ) : (
              <AulaPlayer
                key={aula.id}
                teraboxUrl={aula.terabox_url ?? ""}
                aulaId={aula.id}
                initialTime={tempos[aula.id]?.current || 0}
                onTimeUpdate={(curr, dur) => handleTimeUpdate(aula.id, curr, dur)}
                onPause={() => gravarProgressoAgora(aula.id)}
                onEnded={aoTerminar}
                autoPlay={tocarAutomatico}
                offlineObjectUrl={offlineSource.url}
                isOnline={isOnline}
              />
            )}
          </div>

          <aside>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
              <Video className="h-5 w-5 text-primary" /> Vídeo<sup className="text-xs text-muted-foreground">1</sup>
            </h2>
            <div className="space-y-2.5">
              <div data-active="true" className="rfx-video flex w-full items-center gap-3 px-4 py-3 text-left">
                <Play className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="rfx-video-sub block text-xs text-muted-foreground">
                    Vídeo 1{aula.progresso > 0 ? ` · ${aula.progresso}% assistido` : ""}
                  </span>
                  <span className="block text-sm font-medium">{aula.titulo}</span>
                </span>
              </div>
            </div>

            {emLista && (
              <div className="mt-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ListVideo className="h-4 w-4 text-primary" /> Nesta lista
                </h3>
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {aulasDaLista.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      data-active={a.id === aula.id}
                      onClick={() => a.id !== aula.id && irPara(a.id, true)}
                      className="rfx-video flex w-full items-center gap-2.5 px-3 py-2 text-left"
                    >
                      <span className="w-5 shrink-0 text-xs font-semibold">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{a.titulo}</span>
                      {a.concluida && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {videoUrl ? (
                <>
                  <a
                    href={videoUrl}
                    download={`${nomeVideo}.mp4`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={isOnline ? "Baixar vídeo" : "Sem internet para baixar o vídeo"}
                    aria-disabled={!isOnline}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-surface-2 ${
                      isOnline ? "" : "pointer-events-none opacity-50"
                    }`}
                  >
                    <Download className="h-3.5 w-3.5 text-primary" />
                    Baixar vídeo
                  </a>
                  <VideoOfflineButton aulaId={aula.id} videoUrl={videoUrl} title={aula.titulo} isOnline={isOnline} />
                </>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Vídeo indisponível"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground/40"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar vídeo
                </button>
              )}
            </div>

            {!isOnline && videoUrl && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                Sem internet para baixar o vídeo
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={!anterior}
                onClick={() => anterior && irPara(anterior.id)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <button
                type="button"
                disabled={!proxima}
                onClick={() => proxima && irPara(proxima.id)}
                className="btn-sun inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </div>

        <div ref={materiaisRef} className="mt-6 scroll-mt-20">
          <AulaMateriais aulaId={aula.id} />
        </div>
      </section>

      <CriarFlashcardAulaModal
        open={flashcardAberto}
        onClose={() => setFlashcardAberto(false)}
        aulaTitulo={aula.titulo}
        aulaDisciplina={aula.disciplina}
      />
    </div>
  );
}
