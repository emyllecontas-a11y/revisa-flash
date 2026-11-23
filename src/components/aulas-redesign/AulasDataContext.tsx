// src/components/aulas-redesign/AulasDataContext.tsx
//
// Guarda TUDO que as 3 telas novas de Aulas compartilham (lista de aulas, "estudei",
// favoritas, progresso do vídeo, vídeos offline, reordenar). Os dados são carregados
// UMA vez e ficam disponíveis enquanto o usuário navega entre as telas.
//
// Mesma lógica do antigo AulasPage.tsx (mesmas chaves de localStorage, mesmo serviço),
// só reorganizada para servir às 3 telas.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  getAulasDoUsuario,
  atualizarOrdemAula,
  getAulasCacheInfo,
} from "@/services/aulaService";
import {
  getOfflineAulaIds,
  subscribeToDownloads,
  type DownloadState,
  type DownloadPhase,
} from "@/services/videoOfflineService";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import {
  formatarAula,
  construirArvore,
  achatarArvore,
  type AssuntoNode,
  type AulaItem,
} from "../aulas/aulasArvore";
import type { AulaTone } from "../aulas/aulas-data";

// Intervalo mínimo entre gravações do progresso do vídeo no localStorage.
const INTERVALO_GRAVACAO_PROGRESSO_MS = 5000;
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const TONES: AulaTone[] = ["laranja", "rosa", "menta", "lavanda"];

/** Transforma "Direito Previdenciário" em "direito-previdenciario" (usado na URL). */
export function slugDisciplina(nome: string): string {
  const slug = (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "geral";
}

/** Cor da disciplina: sempre a mesma para o mesmo nome. */
function toneDaDisciplina(nome: string): AulaTone {
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma = (soma + nome.charCodeAt(i) * (i + 1)) % 997;
  return TONES[soma % TONES.length];
}

/** Aula criada nos últimos 7 dias. */
export function aulaEhNova(createdAt: string): boolean {
  const t = Date.parse(createdAt);
  return !Number.isNaN(t) && Date.now() - t < SETE_DIAS_MS;
}

export interface DisciplinaResumo {
  slug: string;
  nome: string;
  tone: AulaTone;
  assuntos: AssuntoNode<AulaItem>[];
  aulas: AulaItem[]; // na ordem em que aparecem na tela
  totalAulas: number;
  totalConcluidas: number;
  progresso: number; // 0 a 100
}

interface AulasDataValue {
  loading: boolean;
  isOnline: boolean;
  isFromCache: boolean;
  cacheSavedAt: string | null;
  disciplinas: DisciplinaResumo[];
  totalAulas: number;
  getDisciplina: (slug: string | undefined) => DisciplinaResumo | undefined;
  offlineAulaIds: Set<string>;
  setOfflineAulaIds: Dispatch<SetStateAction<Set<string>>>;
  downloadProgress: Record<string, DownloadState>;
  tempos: Record<string, { current: number; total: number }>;
  toggleConcluida: (id: string) => void;
  toggleFavorita: (id: string) => void;
  handleTimeUpdate: (id: string, current: number, total: number) => void;
  gravarProgressoAgora: (id: string) => void;
  handleMover: (aula: AulaItem, grupo: AulaItem[], direcao: -1 | 1) => Promise<void>;
  /** Id da aula aberta agora (a tela da aula preenche; serve para o aviso de download concluído). */
  aulaAtivaRef: MutableRefObject<string | null>;
  videosOfflineAberto: boolean;
  setVideosOfflineAberto: (aberto: boolean) => void;
}

const AulasDataContext = createContext<AulasDataValue | null>(null);

export function useAulasData(): AulasDataValue {
  const ctx = useContext(AulasDataContext);
  if (!ctx) throw new Error("useAulasData precisa estar dentro de <AulasDataProvider>");
  return ctx;
}

function lerJson<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function AulasDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAppUser();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [aulasRaw, setAulasRaw] = useState<ReturnType<typeof formatarAula>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheSavedAt, setCacheSavedAt] = useState<string | null>(null);

  // Mesmas chaves do AulasPage antigo: quem já marcou "concluída" não perde nada.
  const storageKeyConcluidas = `unavox_aulas_concluidas_${user?.id || "anon"}`;
  const storageKeyFavoritas = `unavox_aulas_favoritas_${user?.id || "anon"}`;
  const storageKeyProgresso = `unavox_aulas_progresso_${user?.id || "anon"}`;

  const [concluidas, setConcluidas] = useState<Record<string, boolean>>({});
  const [favoritas, setFavoritas] = useState<Record<string, boolean>>({});
  const [tempos, setTempos] = useState<Record<string, { current: number; total: number }>>({});
  const ultimoProgressoWriteRef = useRef(0);

  const [offlineAulaIds, setOfflineAulaIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadState>>({});
  const [videosOfflineAberto, setVideosOfflineAberto] = useState(false);

  const aulaAtivaRef = useRef<string | null>(null);
  const ultimaFaseRef = useRef<Map<string, DownloadPhase>>(new Map());

  // Lê "concluídas", favoritas e progresso salvos neste aparelho.
  useEffect(() => {
    setConcluidas(lerJson(storageKeyConcluidas, {}));
    setFavoritas(lerJson(storageKeyFavoritas, {}));
    setTempos(lerJson(storageKeyProgresso, {}));
  }, [storageKeyConcluidas, storageKeyFavoritas, storageKeyProgresso]);

  // IDs de aulas com vídeo baixado.
  useEffect(() => {
    getOfflineAulaIds().then(setOfflineAulaIds);
  }, []);

  // Acompanha o progresso dos downloads.
  useEffect(() => {
    const unsubscribe = subscribeToDownloads((states) => {
      const progress: Record<string, DownloadState> = {};
      states.forEach((state, aulaId) => {
        progress[aulaId] = state;
      });
      setDownloadProgress(progress);
      setOfflineAulaIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        states.forEach((state, aulaId) => {
          if (state.phase === "complete" && !next.has(aulaId)) {
            next.add(aulaId);
            changed = true;
          } else if ((state.phase === "idle" || state.phase === "error") && next.has(aulaId)) {
            next.delete(aulaId);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      states.forEach((state, aulaId) => {
        const anterior = ultimaFaseRef.current.get(aulaId);
        ultimaFaseRef.current.set(aulaId, state.phase);
        if (anterior && anterior !== "complete" && state.phase === "complete") {
          if (aulaId === aulaAtivaRef.current) {
            toastRef.current.success(
              "Vídeo salvo. Ele será usado offline na próxima vez que você abrir esta aula.",
            );
          }
        }
      });
    });
    return unsubscribe;
  }, []);

  // Busca no Supabase (ou no cache offline) e formata.
  const recarregar = useCallback(async () => {
    if (!user?.id) return;
    const data = await getAulasDoUsuario(user.id);
    setAulasRaw(data.map(formatarAula));
    const info = getAulasCacheInfo(user.id);
    setIsFromCache(info.isFromCache);
    setCacheSavedAt(info.savedAt);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Conexão: ao voltar a internet, recarrega a lista.
  useEffect(() => {
    const online = () => {
      setIsOnline(true);
      if (user?.id) recarregar();
    };
    const offline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [user?.id, recarregar]);

  const toggleConcluida = useCallback(
    (id: string) => {
      setConcluidas((prev) => {
        const updated = { ...prev, [id]: !prev[id] };
        try {
          localStorage.setItem(storageKeyConcluidas, JSON.stringify(updated));
        } catch {
          /* localStorage indisponível: ignora */
        }
        return updated;
      });
    },
    [storageKeyConcluidas],
  );

  const toggleFavorita = useCallback(
    (id: string) => {
      setFavoritas((prev) => {
        const updated = { ...prev, [id]: !prev[id] };
        try {
          localStorage.setItem(storageKeyFavoritas, JSON.stringify(updated));
        } catch {
          /* ignora */
        }
        return updated;
      });
    },
    [storageKeyFavoritas],
  );

  const handleTimeUpdate = useCallback(
    (id: string, current: number, total: number) => {
      setTempos((prev) => {
        const next = { ...prev, [id]: { current, total } };
        // Grava no máximo uma vez a cada 5 s (evita I/O a cada frame).
        const agora = Date.now();
        if (agora - ultimoProgressoWriteRef.current >= INTERVALO_GRAVACAO_PROGRESSO_MS) {
          ultimoProgressoWriteRef.current = agora;
          try {
            localStorage.setItem(storageKeyProgresso, JSON.stringify(next));
          } catch {
            /* ignora */
          }
        }
        return next;
      });
    },
    [storageKeyProgresso],
  );

  const temposRef = useRef(tempos);
  temposRef.current = tempos;

  // Grava o progresso na hora (ao pausar e ao sair da aula).
  const gravarProgressoAgora = useCallback(
    (id: string) => {
      const registro = temposRef.current[id];
      if (!registro) return;
      try {
        const atual = JSON.parse(localStorage.getItem(storageKeyProgresso) || "{}");
        localStorage.setItem(storageKeyProgresso, JSON.stringify({ ...atual, [id]: registro }));
      } catch {
        /* ignora */
      }
      ultimoProgressoWriteRef.current = Date.now();
    },
    [storageKeyProgresso],
  );

  // Troca a ordem com a aula vizinha do MESMO grupo (mesmo assunto + mesmo subassunto).
  const handleMover = useCallback(
    async (aula: AulaItem, grupo: AulaItem[], direcao: -1 | 1) => {
      if (!user?.id) return;
      const posicao = grupo.findIndex((item) => item.id === aula.id);
      const vizinho = grupo[posicao + direcao];
      if (posicao < 0 || !vizinho) return;

      if (aula.ordem === vizinho.ordem) {
        // Empate herdado de dados antigos: renumera o grupo inteiro.
        const reordenado = [...grupo];
        reordenado.splice(posicao, 1);
        reordenado.splice(posicao + direcao, 0, aula);
        for (let i = 0; i < reordenado.length; i++) {
          const novaOrdem = i + 1;
          if (reordenado[i].ordem !== novaOrdem) {
            await atualizarOrdemAula(reordenado[i].id, novaOrdem);
          }
        }
      } else {
        await atualizarOrdemAula(aula.id, vizinho.ordem);
        await atualizarOrdemAula(vizinho.id, aula.ordem);
      }
      await recarregar();
    },
    [user?.id, recarregar],
  );

  // Junta as aulas do banco com o estado local (concluída, favorita, progresso).
  const aulas = useMemo<AulaItem[]>(
    () =>
      aulasRaw.map((a) => {
        const isConcluida = !!concluidas[a.id];
        const progresso = isConcluida
          ? 100
          : tempos[a.id]?.total
            ? Math.round((tempos[a.id].current / tempos[a.id].total) * 100)
            : 0;
        return {
          ...a,
          concluida: isConcluida,
          favorita: !!favoritas[a.id],
          progresso: Math.min(100, Math.max(0, progresso)),
        };
      }),
    [aulasRaw, concluidas, favoritas, tempos],
  );

  const disciplinas = useMemo<DisciplinaResumo[]>(() => {
    const arvore = construirArvore(aulas);
    const usados = new Set<string>();
    return arvore.map((d) => {
      // Nomes que gerariam o mesmo endereço ganham um sufixo, para nunca se misturarem.
      let slug = slugDisciplina(d.nome);
      let n = 2;
      while (usados.has(slug)) slug = `${slugDisciplina(d.nome)}-${n++}`;
      usados.add(slug);

      const lista = achatarArvore([d]);
      const totalConcluidas = lista.filter((a) => a.concluida).length;
      return {
        slug,
        nome: d.nome,
        tone: toneDaDisciplina(d.nome),
        assuntos: d.assuntos,
        aulas: lista,
        totalAulas: lista.length,
        totalConcluidas,
        progresso: Math.round((totalConcluidas / Math.max(lista.length, 1)) * 100),
      };
    });
  }, [aulas]);

  const getDisciplina = useCallback(
    (slug: string | undefined) => disciplinas.find((d) => d.slug === slug),
    [disciplinas],
  );

  const value: AulasDataValue = {
    loading,
    isOnline,
    isFromCache,
    cacheSavedAt,
    disciplinas,
    totalAulas: aulas.length,
    getDisciplina,
    offlineAulaIds,
    setOfflineAulaIds,
    downloadProgress,
    tempos,
    toggleConcluida,
    toggleFavorita,
    handleTimeUpdate,
    gravarProgressoAgora,
    handleMover,
    aulaAtivaRef,
    videosOfflineAberto,
    setVideosOfflineAberto,
  };

  return <AulasDataContext.Provider value={value}>{children}</AulasDataContext.Provider>;
}
