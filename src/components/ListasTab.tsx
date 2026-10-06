// src/components/ListasTab.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getListas,
  importarLista,
  excluirLista,
  restaurarLista,
  buscarTodosResultados,
  getPastas,
  criarPasta,
  renomearPasta,
  excluirPasta,
  moverListaParaPasta,
  reordenarPastas,
} from "@/services/listaService";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Lista, ResultadoLista, Pasta, ListaImport } from "@/lib/listas-types";
import { EstatisticasListasModal } from "@/components/EstatisticasListasModal";
import { EditarListaModal } from "@/components/EditarListaModal";
import { GerenciarQuestoesModal } from "@/components/GerenciarQuestoesModal";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ListChecks, Play, Loader2, Layers, Plus, X, CheckCircle2,
  RotateCcw, Trash2, Clock, History, Image as ImageIcon, TrendingUp, Pencil,
  Folder, FolderOpen, FolderPlus, ChevronRight, ArrowLeft, FolderInput,
  Search, ChevronUp, ChevronDown, AlertCircle,
} from "lucide-react";

// ============================================================
// DISCIPLINAS
// ============================================================

interface Discipline {
  id: string;
  name: string;
}

async function getDisciplinesAuth(userId: string): Promise<{ success: boolean; data?: Discipline[]; error?: string }> {
  try {
    const client = await getSupabaseWithToken();
    const { data, error } = await client
      .from('disciplines')
      .select('*')
      .eq('user_id', userId)
      .eq('isDeleted', false)
      .order('name', { ascending: true });

    if (error) throw error;
    return { success: true, data: (data || []) as Discipline[] };
  } catch (error: any) {
    console.error('Erro ao buscar disciplinas:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export function ListasTab() {
  const navigate = useNavigate();
  const { user } = useAppUser();
  const toast = useToast();
  const confirmDialog = useConfirm();

  // Dados brutos
  const [disciplinas, setDisciplinas] = useState<Discipline[]>([]);
  const [todasListas, setTodasListas] = useState<Lista[]>([]);
  const [todasPastas, setTodasPastas] = useState<Pasta[]>([]);
  const [resultados, setResultados] = useState<ResultadoLista[]>([]);

  // Navegação
  const [disciplinaAberta, setDisciplinaAberta] = useState<Discipline | null>(null);
  const [pastaAberta, setPastaAberta] = useState<Pasta | null>(null);

  // Estado geral
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  // Drag & drop
  const [draggedListaId, setDraggedListaId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Modais
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [historicoLista, setHistoricoLista] = useState<Lista | null>(null);
  const [editandoLista, setEditandoLista] = useState<Lista | null>(null);
  const [gerenciandoLista, setGerenciandoLista] = useState<Lista | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [listaParaMover, setListaParaMover] = useState<Lista | null>(null);

  // Modais de pasta
  const [modalNovaPasta, setModalNovaPasta] = useState(false);
  const [modalRenomearPasta, setModalRenomearPasta] = useState<Pasta | null>(null);
  const [modalExcluirPasta, setModalExcluirPasta] = useState<Pasta | null>(null);

  const reorderingRef = useRef(false);

  // ============================================================
  // CARREGAR DADOS (unificado — inclui pastas)
  // ============================================================
  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [discResult, listasResult, pastasResult, resultadosResult] = await Promise.all([
        getDisciplinesAuth(user.id),
        getListas(user.id),
        getPastas(user.id),
        buscarTodosResultados(user.id),
      ]);

      if (discResult.success && discResult.data) {
        setDisciplinas(discResult.data);
      }
      if (listasResult.success && listasResult.data) {
        setTodasListas(listasResult.data);
      } else {
        setError(listasResult.error || "Erro ao carregar listas");
      }
      if (pastasResult.success && pastasResult.data) {
        setTodasPastas(pastasResult.data);
      }
      if (resultadosResult.success && resultadosResult.data) {
        setResultados(resultadosResult.data);
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setBusca("");
  }, [disciplinaAberta?.id, pastaAberta?.id]);

  // ============================================================
  // DERIVADOS
  // ============================================================

  const pastasDaDisciplina = useMemo(() => {
    if (!disciplinaAberta) return [];
    return [...todasPastas]
      .filter((p) => p.discipline_id === disciplinaAberta.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  }, [todasPastas, disciplinaAberta]);

  const listasPorDisciplina = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of todasListas) {
      mapa[l.discipline_id] = (mapa[l.discipline_id] || 0) + 1;
    }
    return mapa;
  }, [todasListas]);

  const contagemPorPasta = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of todasListas) {
      if (l.folder_id) {
        mapa[l.folder_id] = (mapa[l.folder_id] || 0) + 1;
      }
    }
    return mapa;
  }, [todasListas]);

  const termoBusca = busca.trim().toLowerCase();

  const listasDaDisciplinaSemPasta = useMemo(() => {
    if (!disciplinaAberta) return [];
    let arr = todasListas.filter(
      (l) => l.discipline_id === disciplinaAberta.id && !l.folder_id
    );
    if (termoBusca) {
      arr = arr.filter((l) => l.titulo.toLowerCase().includes(termoBusca));
    }
    return arr;
  }, [todasListas, disciplinaAberta, termoBusca]);

  const listasDaPasta = useMemo(() => {
    if (!pastaAberta) return [];
    let arr = todasListas.filter((l) => l.folder_id === pastaAberta.id);
    if (termoBusca) {
      arr = arr.filter((l) => l.titulo.toLowerCase().includes(termoBusca));
    }
    return arr;
  }, [todasListas, pastaAberta, termoBusca]);

  const pastasFiltradas = useMemo(() => {
    if (!termoBusca) return pastasDaDisciplina;
    return pastasDaDisciplina.filter((p) => p.name.toLowerCase().includes(termoBusca));
  }, [pastasDaDisciplina, termoBusca]);

  const disciplinasFiltradas = useMemo(() => {
    if (!termoBusca) return disciplinas;
    return disciplinas.filter((d) => d.name.toLowerCase().includes(termoBusca));
  }, [disciplinas, termoBusca]);

  const ultimosResultados = useMemo(() => {
    const mapa: Record<string, ResultadoLista> = {};
    for (const r of resultados) {
      if (!mapa[r.lista_id]) mapa[r.lista_id] = r;
    }
    return mapa;
  }, [resultados]);

  // ============================================================
  // AÇÕES
  // ============================================================

  const handleExcluir = async (lista: Lista) => {
    if (!user?.id) return;

    const ok = await confirmDialog({
      title: `Excluir "${lista.titulo}"?`,
      description: "A lista e o histórico dela serão removidos. Você pode desfazer em alguns segundos.",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    setExcluindo(lista.id);
    try {
      const result = await excluirLista(lista.id, user.id);
      if (result.success) {
        setTodasListas((prev) => prev.filter((l) => l.id !== lista.id));

        toast.undoable(
          `Lista "${lista.titulo}" excluída`,
          async () => {
            const r = await restaurarLista(lista.id, user.id);
            if (r.success) {
              toast.success("Lista restaurada");
              loadData();
            } else {
              toast.error("Não foi possível restaurar");
            }
          },
          { description: "Você tem alguns segundos para desfazer." }
        );
      } else {
        toast.error("Erro ao excluir", { description: result.error });
      }
    } catch (err: any) {
      toast.error("Erro ao excluir", { description: err.message });
    } finally {
      setExcluindo(null);
    }
  };

  const handleEntrarDisciplina = (d: Discipline) => {
    setDisciplinaAberta(d);
    setPastaAberta(null);
  };

  const handleVoltarParaDisciplinas = () => {
    setDisciplinaAberta(null);
    setPastaAberta(null);
  };

  const handleVoltarParaDisciplina = () => {
    setPastaAberta(null);
  };

  // ============================================================
  // DRAG & DROP
  // ============================================================

  const handleDragStart = (e: React.DragEvent, listaId: string) => {
    e.dataTransfer.setData("text/plain", listaId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedListaId(listaId);
  };

  const handleDragEnd = () => {
    setDraggedListaId(null);
    setDropTargetId(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedListaId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetId !== targetId) setDropTargetId(targetId);
  };

  const handleDragLeave = (e: React.DragEvent, targetId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    if (dropTargetId === targetId) setDropTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, targetFolderId: string | null) => {
    e.preventDefault();
    const listaId = e.dataTransfer.getData("text/plain") || draggedListaId;
    setDraggedListaId(null);
    setDropTargetId(null);

    if (!listaId || !user?.id) return;

    const lista = todasListas.find((l) => l.id === listaId);
    if (!lista) return;

    if (lista.folder_id === targetFolderId) return;

    try {
      const result = await moverListaParaPasta(listaId, user.id, targetFolderId);
      if (result.success) {
        setTodasListas((prev) =>
          prev.map((l) => (l.id === listaId ? { ...l, folder_id: targetFolderId } : l))
        );
        toast.success("Lista movida");
      } else {
        toast.error("Erro ao mover", { description: result.error });
      }
    } catch (err: any) {
      toast.error("Erro ao mover", { description: err.message });
    }
  };

  // ============================================================
  // REORDENAR PASTAS
  // ============================================================

  const handleMoverPasta = async (pasta: Pasta, direction: "up" | "down") => {
    if (!user?.id || reorderingRef.current || !disciplinaAberta) return;

    const listaAtual = pastasDaDisciplina;
    const idx = listaAtual.findIndex((p) => p.id === pasta.id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= listaAtual.length) return;

    const novaOrdem = [...listaAtual];
    [novaOrdem[idx], novaOrdem[newIdx]] = [novaOrdem[newIdx], novaOrdem[idx]];

    const itens = novaOrdem.map((p, i) => ({ id: p.id, order: i }));

    // Otimista
    setTodasPastas((prev) =>
      prev.map((p) => {
        const item = itens.find((it) => it.id === p.id);
        return item ? { ...p, order: item.order } : p;
      })
    );

    reorderingRef.current = true;
    try {
      const result = await reordenarPastas(user.id, itens);
      if (!result.success) {
        toast.error("Erro ao reordenar", { description: result.error });
        loadData();
      }
    } catch (err: any) {
      toast.error("Erro ao reordenar", { description: err.message });
      loadData();
    } finally {
      reorderingRef.current = false;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rf-card p-6 text-center">
        <p className="text-accent">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ============================================================
  // NÍVEL 1 — DISCIPLINAS
  // ============================================================
  if (!disciplinaAberta) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Buscar disciplina…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
            />
          </div>
          {resultados.length > 0 && (
            <button
              onClick={() => setIsStatsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
            >
              <TrendingUp className="h-4 w-4" /> Ver estatísticas
            </button>
          )}
        </div>

        {disciplinas.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-display text-sm font-semibold">Nenhuma disciplina ainda</h3>
            <p className="mt-1 max-w-xs text-xs text-foreground/45">
              Crie uma disciplina em Configurações antes de importar listas.
            </p>
          </div>
        ) : disciplinasFiltradas.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-8 text-center">
            <p className="text-xs text-foreground/45">Nenhuma disciplina encontrada para "{busca}".</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {disciplinasFiltradas.map((d) => {
              const qtd = listasPorDisciplina[d.id] || 0;
              return (
                <button
                  key={d.id}
                  onClick={() => handleEntrarDisciplina(d)}
                  className="rf-card rf-card-hover flex flex-col items-start p-5 text-left transition-colors"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Folder className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-display text-base font-semibold tracking-tight">
                    {d.name}
                  </h3>
                  <p className="mt-1 text-xs text-foreground/45">
                    {qtd === 0 ? "Nenhuma lista" : `${qtd} ${qtd === 1 ? "lista" : "listas"}`}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Abrir <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {isStatsModalOpen && (
          <EstatisticasListasModal
            listas={todasListas}
            resultados={resultados}
            onClose={() => setIsStatsModalOpen(false)}
          />
        )}
      </>
    );
  }

  // ============================================================
  // BREADCRUMB
  // ============================================================
  const breadcrumb = (
    <nav className="mb-4 flex items-center gap-1.5 text-xs text-foreground/55 overflow-x-auto">
      <button
        onClick={handleVoltarParaDisciplinas}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/5 hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Disciplinas
      </button>
      <ChevronRight className="h-3 w-3 shrink-0" />
      {pastaAberta ? (
        <>
          <button
            onClick={handleVoltarParaDisciplina}
            className="rounded-md px-1.5 py-1 hover:bg-white/5 hover:text-foreground transition-colors shrink-0"
          >
            {disciplinaAberta.name}
          </button>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="rounded-md px-1.5 py-1 text-foreground font-medium truncate">
            {pastaAberta.name}
          </span>
        </>
      ) : (
        <span className="rounded-md px-1.5 py-1 text-foreground font-medium truncate">
          {disciplinaAberta.name}
        </span>
      )}
    </nav>
  );

  // ============================================================
  // NÍVEL 3 — LISTAS DA PASTA
  // ============================================================
  if (pastaAberta) {
    return (
      <>
        {breadcrumb}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">{pastaAberta.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
              <input
                type="text"
                placeholder="Buscar lista…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full sm:w-64 rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
              />
            </div>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
            >
              <Plus className="h-4 w-4" /> Importar
            </button>
          </div>
        </div>

        <div
          onDragOver={(e) => handleDragOver(e, "__root__")}
          onDragLeave={(e) => handleDragLeave(e, "__root__")}
          onDrop={(e) => handleDrop(e, "__root__", null)}
          className={[
            "mb-4 flex items-center justify-center rounded-xl border border-dashed p-3 text-xs transition-colors",
            dropTargetId === "__root__"
              ? "border-primary bg-primary/5 text-primary"
              : "border-border/60 bg-surface/30 text-foreground/40",
          ].join(" ")}
        >
          {dropTargetId === "__root__"
            ? "Solte aqui para mover para fora desta pasta"
            : "Arraste uma lista para cá para movê-la para fora da pasta"}
        </div>

        {listasDaPasta.length === 0 ? (
          termoBusca ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-8 text-center">
              <p className="text-xs text-foreground/45">Nenhuma lista encontrada para "{busca}".</p>
            </div>
          ) : (
            <EmptyStateListas
              titulo="Nenhuma lista nesta pasta"
              descricao="Importe um JSON para criar a primeira lista desta pasta."
              onImportar={() => setIsImportModalOpen(true)}
            />
          )
        ) : (
          <GridListas
            listas={listasDaPasta}
            ultimosResultados={ultimosResultados}
            excluindo={excluindo}
            onAbrir={(l) => navigate(`/listas/${l.id}`)}
            onExcluir={handleExcluir}
            onHistorico={setHistoricoLista}
            onGerenciar={setGerenciandoLista}
            onEditar={setEditandoLista}
            onMover={setListaParaMover}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        )}

        {isImportModalOpen && user?.id && (
          <ImportListaModal
            userId={user.id}
            disciplinaInicial={disciplinaAberta.id}
            pastaInicial={pastaAberta.id}
            pastasDisponiveis={todasPastas}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={() => {
              setIsImportModalOpen(false);
              loadData();
            }}
          />
        )}

        {historicoLista && (
          <HistoricoListaModal
            lista={historicoLista}
            resultados={resultados.filter((r) => r.lista_id === historicoLista.id)}
            onClose={() => setHistoricoLista(null)}
          />
        )}

        {editandoLista && user?.id && (
          <EditarListaModal
            lista={editandoLista}
            userId={user.id}
            onClose={() => setEditandoLista(null)}
            onSuccess={() => {
              setEditandoLista(null);
              loadData();
            }}
          />
        )}

        {gerenciandoLista && user?.id && (
          <GerenciarQuestoesModal
            lista={gerenciandoLista}
            userId={user.id}
            onClose={() => setGerenciandoLista(null)}
            onListaAlterada={() => loadData()}
          />
        )}

        {listaParaMover && user?.id && (
          <MoverListaModal
            lista={listaParaMover}
            pastas={pastasDaDisciplina}
            userId={user.id}
            onClose={() => setListaParaMover(null)}
            onSuccess={() => {
              setListaParaMover(null);
              loadData();
            }}
          />
        )}
      </>
    );
  }

  // ============================================================
  // NÍVEL 2 — PASTAS + LISTAS SEM PASTA
  // ============================================================
  return (
    <>
      {breadcrumb}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">{disciplinaAberta.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Buscar pasta ou lista…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full sm:w-64 rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
            />
          </div>
          <button
            onClick={() => setModalNovaPasta(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
          >
            <FolderPlus className="h-4 w-4" /> Nova pasta
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
          >
            <Plus className="h-4 w-4" /> Importar
          </button>
        </div>
      </div>

      {pastasDaDisciplina.length === 0 && listasDaDisciplinaSemPasta.length === 0 && !termoBusca ? (
        <EmptyStateListas
          titulo="Nenhuma pasta ou lista ainda"
          descricao="Crie uma pasta para organizar suas listas ou importe direto nesta disciplina."
          onImportar={() => setIsImportModalOpen(true)}
          onNovaPasta={() => setModalNovaPasta(true)}
        />
      ) : (
        <div className="space-y-6">
          {pastasFiltradas.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/45">
                Pastas
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastasFiltradas.map((p, idx) => {
                  const qtd = contagemPorPasta[p.id] || 0;
                  const isDropTarget = dropTargetId === p.id;
                  const isFirst = idx === 0;
                  const isLast = idx === pastasFiltradas.length - 1;
                  return (
                    <div
                      key={p.id}
                      onDragOver={(e) => handleDragOver(e, p.id)}
                      onDragLeave={(e) => handleDragLeave(e, p.id)}
                      onDrop={(e) => handleDrop(e, p.id, p.id)}
                      className={[
                        "rf-card rf-card-hover flex flex-col p-5 transition-all",
                        isDropTarget ? "ring-2 ring-primary bg-primary/5" : "",
                      ].join(" ")}
                    >
                      <button
                        onClick={() => setPastaAberta(p)}
                        className="flex flex-1 flex-col items-start text-left"
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                            {isDropTarget ? (
                              <FolderOpen className="h-5 w-5" />
                            ) : (
                              <Folder className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoverPasta(p, "up");
                              }}
                              disabled={isFirst}
                              className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover para cima"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoverPasta(p, "down");
                              }}
                              disabled={isLast}
                              className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover para baixo"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <h4 className="mt-3 font-display text-base font-semibold tracking-tight break-words w-full">
                          {p.name}
                        </h4>
                        <p className="mt-1 text-xs text-foreground/45">
                          {qtd === 0 ? "Nenhuma lista" : `${qtd} ${qtd === 1 ? "lista" : "listas"}`}
                        </p>
                        <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                          Abrir <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </button>
                      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                        <button
                          onClick={() => setModalRenomearPasta(p)}
                          className="inline-flex items-center gap-1 text-[11px] text-foreground/55 hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3 w-3" /> Renomear
                        </button>
                        <button
                          onClick={() => setModalExcluirPasta(p)}
                          className="ml-auto inline-flex items-center gap-1 text-[11px] text-foreground/55 hover:text-accent transition-colors"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div
            onDragOver={(e) => handleDragOver(e, "__sem_pasta__")}
            onDragLeave={(e) => handleDragLeave(e, "__sem_pasta__")}
            onDrop={(e) => handleDrop(e, "__sem_pasta__", null)}
            className={[
              "rounded-xl border border-dashed p-3 text-xs text-center transition-colors",
              dropTargetId === "__sem_pasta__"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border/60 bg-surface/30 text-foreground/40",
            ].join(" ")}
          >
            {dropTargetId === "__sem_pasta__"
              ? "Solte aqui para remover da pasta"
              : "Arraste uma lista para cá para deixá-la sem pasta"}
          </div>

          {listasDaDisciplinaSemPasta.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/45">
                Listas sem pasta
              </h3>
              <GridListas
                listas={listasDaDisciplinaSemPasta}
                ultimosResultados={ultimosResultados}
                excluindo={excluindo}
                onAbrir={(l) => navigate(`/listas/${l.id}`)}
                onExcluir={handleExcluir}
                onHistorico={setHistoricoLista}
                onGerenciar={setGerenciandoLista}
                onEditar={setEditandoLista}
                onMover={setListaParaMover}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            </div>
          )}

          {termoBusca &&
            pastasFiltradas.length === 0 &&
            listasDaDisciplinaSemPasta.length === 0 && (
              <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-8 text-center">
                <p className="text-xs text-foreground/45">
                  Nenhum resultado para "{busca}".
                </p>
              </div>
            )}
        </div>
      )}

      {isImportModalOpen && user?.id && (
        <ImportListaModal
          userId={user.id}
          disciplinaInicial={disciplinaAberta.id}
          pastaInicial={null}
          pastasDisponiveis={todasPastas}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            setIsImportModalOpen(false);
            loadData();
          }}
        />
      )}

      {modalNovaPasta && user?.id && (
        <NovaPastaModal
          userId={user.id}
          disciplinaId={disciplinaAberta.id}
          onClose={() => setModalNovaPasta(false)}
          onSuccess={() => {
            setModalNovaPasta(false);
            loadData();
          }}
        />
      )}

      {modalRenomearPasta && user?.id && (
        <RenomearPastaModal
          pasta={modalRenomearPasta}
          userId={user.id}
          onClose={() => setModalRenomearPasta(null)}
          onSuccess={() => {
            setModalRenomearPasta(null);
            loadData();
          }}
        />
      )}

      {modalExcluirPasta && user?.id && (
        <ExcluirPastaModal
          pasta={modalExcluirPasta}
          qtdListas={contagemPorPasta[modalExcluirPasta.id] || 0}
          userId={user.id}
          onClose={() => setModalExcluirPasta(null)}
          onSuccess={() => {
            setModalExcluirPasta(null);
            setPastaAberta(null);
            loadData();
          }}
        />
      )}

      {historicoLista && (
        <HistoricoListaModal
          lista={historicoLista}
          resultados={resultados.filter((r) => r.lista_id === historicoLista.id)}
          onClose={() => setHistoricoLista(null)}
        />
      )}

      {editandoLista && user?.id && (
        <EditarListaModal
          lista={editandoLista}
          userId={user.id}
          onClose={() => setEditandoLista(null)}
          onSuccess={() => {
            setEditandoLista(null);
            loadData();
          }}
        />
      )}

      {gerenciandoLista && user?.id && (
        <GerenciarQuestoesModal
          lista={gerenciandoLista}
          userId={user.id}
          onClose={() => setGerenciandoLista(null)}
          onListaAlterada={() => loadData()}
        />
      )}

      {listaParaMover && user?.id && (
        <MoverListaModal
          lista={listaParaMover}
          pastas={pastasDaDisciplina}
          userId={user.id}
          onClose={() => setListaParaMover(null)}
          onSuccess={() => {
            setListaParaMover(null);
            loadData();
          }}
        />
      )}
    </>
  );
}

// ============================================================
// GRID DE LISTAS
// ============================================================

function GridListas({
  listas,
  ultimosResultados,
  excluindo,
  onAbrir,
  onExcluir,
  onHistorico,
  onGerenciar,
  onEditar,
  onMover,
  onDragStart,
  onDragEnd,
}: {
  listas: Lista[];
  ultimosResultados: Record<string, ResultadoLista>;
  excluindo: string | null;
  onAbrir: (l: Lista) => void;
  onExcluir: (l: Lista) => void;
  onHistorico: (l: Lista) => void;
  onGerenciar: (l: Lista) => void;
  onEditar: (l: Lista) => void;
  onMover: (l: Lista) => void;
  onDragStart: (e: React.DragEvent, listaId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {listas.map((l) => {
        const ultimo = ultimosResultados[l.id];
        const temResultado = !!ultimo;
        const pct = ultimo?.porcentagem || 0;

        return (
          <article
            key={l.id}
            draggable
            onDragStart={(e) => onDragStart(e, l.id)}
            onDragEnd={onDragEnd}
            className="rf-card rf-card-hover flex flex-col p-5 cursor-grab active:cursor-grabbing"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Lista
                  </span>
                </div>
                <h3 className="mt-2 font-display text-base font-semibold tracking-tight">{l.titulo}</h3>
                <p className="mt-1 text-xs text-foreground/50">{l.descricao || "Sem descrição"}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    temResultado ? "bg-primary/15 text-primary" : "bg-white/5 text-foreground/45",
                  ].join(" ")}
                >
                  {temResultado ? "Concluído" : "Não iniciado"}
                </span>
                <button
                  onClick={() => onExcluir(l)}
                  disabled={excluindo === l.id}
                  className="inline-flex items-center gap-1 text-[10px] text-foreground/30 hover:text-accent transition-colors disabled:opacity-50"
                  title="Excluir lista"
                >
                  {excluindo === l.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  <span>Excluir</span>
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs text-foreground/55">
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> {l.questoes_count || 0} questões
              </span>
              {temResultado && (
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {ultimo.acertos}/{ultimo.total_questoes}
                </span>
              )}
            </div>

            {temResultado && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-foreground/45">
                  <span>Aproveitamento</span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-foreground/35">
                  Última tentativa: {new Date(ultimo.created_at).toLocaleDateString('pt-BR')} ·{" "}
                  {Math.floor(ultimo.tempo_segundos / 60)}min
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onAbrir(l)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 min-w-[100px]"
              >
                {temResultado ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {temResultado ? "Refazer" : "Iniciar"}
              </button>
              {temResultado && (
                <button
                  onClick={() => onHistorico(l)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                  title="Histórico"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => onGerenciar(l)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                title="Gerenciar questões"
              >
                <ListChecks className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onEditar(l)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                title="Editar lista"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onMover(l)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                title="Mover para pasta"
              >
                <FolderInput className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ============================================================
// ESTADO VAZIO
// ============================================================

function EmptyStateListas({
  titulo,
  descricao,
  onImportar,
  onNovaPasta,
}: {
  titulo: string;
  descricao: string;
  onImportar: () => void;
  onNovaPasta?: () => void;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <Layers className="h-5 w-5" />
      </div>
      <h3 className="mt-3 font-display text-sm font-semibold">{titulo}</h3>
      <p className="mt-1 max-w-xs text-xs text-foreground/45">{descricao}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onNovaPasta && (
          <button
            onClick={onNovaPasta}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-surface-2"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Nova pasta
          </button>
        )}
        <button
          onClick={onImportar}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Importar lista
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE HISTÓRICO
// ============================================================

function HistoricoListaModal({
  lista,
  resultados,
  onClose,
}: {
  lista: Lista;
  resultados: ResultadoLista[];
  onClose: () => void;
}) {
  const dadosGrafico = [...resultados]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((r, i) => ({
      tentativa: i + 1,
      pct: r.porcentagem,
      data: new Date(r.created_at).toLocaleDateString("pt-BR"),
    }));

  const melhorPct = resultados.length > 0
    ? Math.max(...resultados.map((r) => r.porcentagem))
    : 0;
  const mediaPct = resultados.length > 0
    ? Math.round(resultados.reduce((s, r) => s + r.porcentagem, 0) / resultados.length)
    : 0;
  const ultimoPct = resultados[0]?.porcentagem ?? 0;
  const penultimoPct = resultados[1]?.porcentagem ?? null;

  const tendencia = penultimoPct !== null ? ultimoPct - penultimoPct : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-lg font-semibold">Histórico de tentativas</h2>
            <p className="text-xs text-foreground/50">{lista.titulo}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {resultados.length === 0 ? (
          <div className="text-center py-8">
            <History className="mx-auto h-10 w-10 text-foreground/20" />
            <p className="mt-3 text-sm text-foreground/50">Nenhuma tentativa registrada.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                  Tentativas
                </div>
                <div className="mt-1 font-display text-xl font-semibold tabular-nums">
                  {resultados.length}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                  Melhor
                </div>
                <div className="mt-1 font-display text-xl font-semibold tabular-nums text-primary">
                  {melhorPct}%
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                  Média
                </div>
                <div className="mt-1 font-display text-xl font-semibold tabular-nums">
                  {mediaPct}%
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">
                  Última
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-display text-xl font-semibold tabular-nums">
                    {ultimoPct}%
                  </span>
                  {tendencia !== null && tendencia !== 0 && (
                    <span
                      className={[
                        "text-[11px] font-semibold",
                        tendencia > 0 ? "text-primary" : "text-accent",
                      ].join(" ")}
                    >
                      {tendencia > 0 ? "▲" : "▼"} {Math.abs(tendencia)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {resultados.length >= 2 && (
              <div className="mb-5 rounded-xl border border-border bg-surface/30 p-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-foreground/40">
                  Evolução do aproveitamento
                </h3>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={dadosGrafico} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="tentativa"
                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(20,20,25,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                        formatter={(value: any) => [`${value}%`, "Aproveitamento"]}
                        labelFormatter={(label, payload) => {
                          const p = (payload as any)?.[0]?.payload;
                          return `Tentativa ${label} · ${p?.data ?? ""}`;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        stroke="var(--primary, #22c55e)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "var(--primary, #22c55e)" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-widest text-foreground/40">
                Tentativas
              </h3>
              {resultados.map((r) => {
                const pct = r.porcentagem;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          pct >= 70 ? 'bg-primary/15 text-primary' :
                          pct >= 50 ? 'bg-warning/15 text-warning' :
                          'bg-accent/15 text-accent'
                        }`}>
                          {pct}%
                        </span>
                        <span className="text-sm font-medium">{r.acertos}/{r.total_questoes} acertos</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground/45">
                        <span>{new Date(r.created_at).toLocaleString('pt-BR')}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {Math.floor(r.tempo_segundos / 60)}min
                        </span>
                        {r.erros > 0 && (
                          <>
                            <span>•</span>
                            <span>{r.erros} {r.erros === 1 ? 'erro' : 'erros'}</span>
                          </>
                        )}
                        {r.nao_respondidas > 0 && (
                          <>
                            <span>•</span>
                            <span>{r.nao_respondidas} não respondida{r.nao_respondidas > 1 ? 's' : ''}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE IMPORTAÇÃO
// ============================================================

interface ImportJob {
  file: File;
  status: "pending" | "importing" | "success" | "error";
  error?: string;
  titulo: string;
}

function ImportListaModal({
  userId,
  disciplinaInicial,
  pastaInicial,
  pastasDisponiveis,
  onClose,
  onSuccess,
}: {
  userId: string;
  disciplinaInicial: string;
  pastaInicial: string | null;
  pastasDisponiveis: Pasta[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();

  const [password, setPassword] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [disciplineId, setDisciplineId] = useState(disciplinaInicial);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [folderId, setFolderId] = useState<string | null>(pastaInicial);
  const [loadingDisciplines, setLoadingDisciplines] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!userId) {
        setLoadingDisciplines(false);
        return;
      }
      const result = await getDisciplinesAuth(userId);
      if (result.success && result.data) {
        setDisciplines(result.data);
        if (!disciplinaInicial && result.data.length > 0) {
          setDisciplineId(result.data[0].id);
        }
      }
      setLoadingDisciplines(false);
    };
    load();
  }, [userId, disciplinaInicial]);

  const handleMudarDisciplina = (novoId: string) => {
    setDisciplineId(novoId);
    setFolderId(null);
  };

  const pastasDaDisciplina = pastasDisponiveis.filter(
    (p) => p.discipline_id === disciplineId
  );

  const handleSelectFiles = (files: File[]) => {
    setError(null);
    const novos: ImportJob[] = [];
    for (const f of files) {
      const titulo = f.name.replace(/\.json$/i, "");
      novos.push({ file: f, status: "pending", titulo });
    }
    setJobs((prev) => [...prev, ...novos]);
  };

  const handleRemoverJob = (idx: number) => {
    if (importing) return;
    setJobs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    setError(null);

    if (password !== "admin123") {
      setError("Senha incorreta");
      return;
    }
    if (jobs.length === 0) {
      setError("Selecione pelo menos um arquivo JSON");
      return;
    }
    if (!disciplineId) {
      setError("Selecione uma disciplina");
      return;
    }
    if (!userId) {
      setError("Usuário não autenticado");
      return;
    }

    setImporting(true);

    let sucessos = 0;
    let falhas = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (job.status === "success") continue;

      setJobs((prev) =>
        prev.map((j, idx) => (idx === i ? { ...j, status: "importing" } : j))
      );

      try {
        const text = await job.file.text();
        const json = JSON.parse(text) as ListaImport;

        const result = await importarLista(json, userId, disciplineId, imageFiles, folderId);

        if (result.success) {
          sucessos++;
          setJobs((prev) =>
            prev.map((j, idx) =>
              idx === i ? { ...j, status: "success", titulo: json.titulo || j.titulo } : j
            )
          );
        } else {
          falhas++;
          setJobs((prev) =>
            prev.map((j, idx) =>
              idx === i ? { ...j, status: "error", error: result.error } : j
            )
          );
        }
      } catch (err: any) {
        falhas++;
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, status: "error", error: err.message || "Erro ao processar" } : j
          )
        );
      }
    }

    setImporting(false);
    setDone(true);

    if (sucessos > 0 && falhas === 0) {
      toast.success(`${sucessos} ${sucessos === 1 ? "lista importada" : "listas importadas"}`);
    } else if (sucessos > 0 && falhas > 0) {
      toast.warning(`${sucessos} importadas, ${falhas} com erro`);
    } else {
      toast.error("Nenhuma lista foi importada");
    }

    if (sucessos > 0 && falhas === 0) {
      setTimeout(() => onSuccess(), 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Importar listas (JSON)</h3>
          <button
            onClick={onClose}
            className="text-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done && jobs.every((j) => j.status === "success") ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <p className="mt-3 text-sm font-medium text-foreground">
              Todas as listas foram importadas!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/70">Senha administrativa *</label>
              <input
                type="password"
                placeholder="Digite a senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={importing}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/70">Disciplina *</label>
              {loadingDisciplines ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-foreground/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando disciplinas...
                </div>
              ) : disciplines.length === 0 ? (
                <div className="mt-1 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
                  Você ainda não tem disciplinas cadastradas. Crie uma antes de importar listas.
                </div>
              ) : (
                <select
                  value={disciplineId}
                  onChange={(e) => handleMudarDisciplina(e.target.value)}
                  disabled={importing || !!disciplinaInicial}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1 disabled:opacity-60"
                >
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/70">Pasta (opcional)</label>
              <select
                value={folderId || ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                disabled={importing || !!pastaInicial}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1 disabled:opacity-60"
              >
                <option value="">Sem pasta (direto na disciplina)</option>
                {pastasDaDisciplina.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-foreground/40">
                Todas as listas importadas serão salvas dentro da pasta escolhida.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/70">
                Arquivos JSON * <span className="text-foreground/40">(pode selecionar vários)</span>
              </label>
              <input
                type="file"
                accept=".json"
                multiple
                onChange={(e) => {
                  handleSelectFiles(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
                disabled={importing}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
              />
              <p className="mt-1 text-xs text-foreground/40">
                Cada JSON deve seguir o formato de lista (com campo <code>tipo</code> em cada questão).
              </p>

              {jobs.length > 0 && (
                <div className="mt-3 rounded-lg border border-border bg-surface/40 p-2">
                  <p className="text-[11px] font-medium text-foreground/60 mb-2">
                    {jobs.length} {jobs.length === 1 ? "arquivo na fila" : "arquivos na fila"}:
                  </p>
                  <ul className="space-y-1.5">
                    {jobs.map((j, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px]"
                      >
                        {j.status === "pending" && (
                          <Clock className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                        )}
                        {j.status === "importing" && (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        )}
                        {j.status === "success" && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                        {j.status === "error" && (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
                        )}
                        <span className="truncate font-medium text-foreground/80">{j.titulo}</span>
                        {j.error && (
                          <span className="truncate text-accent/80" title={j.error}>
                            — {j.error}
                          </span>
                        )}
                        {j.status === "pending" && !importing && (
                          <button
                            onClick={() => handleRemoverJob(i)}
                            className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded text-foreground/40 hover:bg-white/5 hover:text-accent"
                            title="Remover da fila"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/70 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                Imagens (opcional)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  setImageFiles(Array.from(e.target.files || []));
                  setError(null);
                }}
                disabled={importing}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
              />
              <p className="mt-1 text-xs text-foreground/40">
                Se algum JSON tiver o campo <code>imagem: "arquivo.jpg"</code>, selecione aqui as imagens correspondentes. Aceita JPEG, PNG e WebP (máx. 2 MB cada).
              </p>

              {imageFiles.length > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-surface/40 p-2">
                  <p className="text-[11px] font-medium text-foreground/60 mb-1">
                    {imageFiles.length} {imageFiles.length === 1 ? "imagem selecionada" : "imagens selecionadas"}:
                  </p>
                  <ul className="space-y-0.5">
                    {imageFiles.map((f, i) => (
                      <li key={i} className="text-[11px] text-foreground/50 truncate">
                        • {f.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent whitespace-pre-wrap">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={importing}
                className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {done ? "Fechar" : "Cancelar"}
              </button>
              <button
                onClick={handleImport}
                disabled={importing || disciplines.length === 0 || jobs.length === 0}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {importing ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importando…
                  </span>
                ) : (
                  `Importar ${jobs.length > 0 ? `(${jobs.length})` : ""}`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAIS DE PASTA
// ============================================================

function NovaPastaModal({
  userId,
  disciplinaId,
  onClose,
  onSuccess,
}: {
  userId: string;
  disciplinaId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSalvar = async () => {
    setError(null);
    setSalvando(true);
    try {
      const result = await criarPasta(userId, disciplinaId, nome);
      if (result.success) {
        toast.success("Pasta criada");
        onSuccess();
      } else {
        setError(result.error || "Erro ao criar pasta");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Nova pasta</h3>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="text-sm font-medium text-foreground/70">Nome da pasta *</label>
        <input
          type="text"
          placeholder="Ex: Acentuação, Sintaxe..."
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={salvando}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSalvar()}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 mt-1"
        />
        {error && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
            {error}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || !nome.trim()}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenomearPastaModal({
  pasta,
  userId,
  onClose,
  onSuccess,
}: {
  pasta: Pasta;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState(pasta.name);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSalvar = async () => {
    setError(null);
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const result = await renomearPasta(pasta.id, userId, nome);
      if (result.success) {
        toast.success("Pasta renomeada");
        onSuccess();
      } else {
        setError(result.error || "Erro ao renomear");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Renomear pasta</h3>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="text-sm font-medium text-foreground/70">Nome da pasta *</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={salvando}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSalvar()}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
        />
        {error && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
            {error}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || !nome.trim() || nome.trim() === pasta.name}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExcluirPastaModal({
  pasta,
  qtdListas,
  userId,
  onClose,
  onSuccess,
}: {
  pasta: Pasta;
  qtdListas: number;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmar = async () => {
    setError(null);
    setExcluindo(true);
    try {
      const result = await excluirPasta(pasta.id, userId);
      if (result.success) {
        toast.success("Pasta excluída", {
          description:
            result.listasMovidas && result.listasMovidas > 0
              ? `${result.listasMovidas} ${result.listasMovidas === 1 ? "lista mantida" : "listas mantidas"} na disciplina.`
              : undefined,
        });
        onSuccess();
      } else {
        setError(result.error || "Erro ao excluir pasta");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Excluir pasta</h3>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-foreground/70">
          Você está prestes a excluir a pasta{" "}
          <strong className="text-foreground">"{pasta.name}"</strong>.
        </p>

        {qtdListas > 0 ? (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/70">
            Esta pasta contém <strong>{qtdListas}</strong>{" "}
            {qtdListas === 1 ? "lista" : "listas"}. Elas <strong>não serão apagadas</strong> —
            continuarão acessíveis na disciplina como "listas sem pasta".
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-border bg-surface/40 p-3 text-xs text-foreground/55">
            Esta pasta está vazia.
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={excluindo}
            className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={excluindo}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {excluindo ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Excluir pasta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE MOVER LISTA
// ============================================================

function MoverListaModal({
  lista,
  pastas,
  userId,
  onClose,
  onSuccess,
}: {
  lista: Lista;
  pastas: Pasta[];
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [folderId, setFolderId] = useState<string | null>(lista.folder_id);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSalvar = async () => {
    setError(null);
    setSalvando(true);
    try {
      const result = await moverListaParaPasta(lista.id, userId, folderId);
      if (result.success) {
        toast.success("Lista movida");
        onSuccess();
      } else {
        setError(result.error || "Erro ao mover lista");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Mover lista</h3>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-foreground/55 mb-4">
          <strong className="text-foreground">{lista.titulo}</strong> será movida. Todas as
          questões, respostas e histórico serão preservados.
        </p>

        <label className="text-sm font-medium text-foreground/70">Mover para:</label>
        <select
          value={folderId || ""}
          onChange={(e) => setFolderId(e.target.value || null)}
          disabled={salvando}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
        >
          <option value="">Sem pasta (direto na disciplina)</option>
          {pastas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {error && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || folderId === lista.folder_id}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Mover"}
          </button>
        </div>
      </div>
    </div>
  );
}