// src/components/ListasTab.tsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getListas,
  importarLista,
  excluirLista,
  buscarTodosResultados,
} from "@/services/listaService";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { useAppUser } from "@/contexts/UserContext";
import { Lista, ResultadoLista } from "@/lib/listas-types";
import { EstatisticasListasModal } from "@/components/EstatisticasListasModal";
import { EditarListaModal } from "@/components/EditarListaModal";
import { GerenciarQuestoesModal } from "@/components/GerenciarQuestoesModal";
import {
  ListChecks, Play, Loader2, Layers, Plus, FileText, X, CheckCircle2,
  RotateCcw, Eye, Trash2, Clock, History, Image as ImageIcon, TrendingUp, Pencil,
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

  const [listas, setListas] = useState<Lista[]>([]);
  const [resultados, setResultados] = useState<ResultadoLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [historicoLista, setHistoricoLista] = useState<Lista | null>(null);
  const [editandoLista, setEditandoLista] = useState<Lista | null>(null);
  const [gerenciandoLista, setGerenciandoLista] = useState<Lista | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  // ============================================================
  // CARREGAR LISTAS E RESULTADOS
  // ============================================================
  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listasResult, resultadosResult] = await Promise.all([
        getListas(user.id),
        buscarTodosResultados(user.id),
      ]);

      if (listasResult.success && listasResult.data) {
        setListas(listasResult.data);
      } else {
        setError(listasResult.error || "Erro ao carregar listas");
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

  const ultimosResultados = (() => {
    const mapa: Record<string, ResultadoLista> = {};
    for (const r of resultados) {
      if (!mapa[r.lista_id]) {
        mapa[r.lista_id] = r;
      }
    }
    return mapa;
  })();

  const handleExcluir = async (lista: Lista) => {
    if (!user?.id) return;
    if (!confirm(`Tem certeza que deseja excluir a lista "${lista.titulo}"?`)) return;

    setExcluindo(lista.id);
    try {
      const result = await excluirLista(lista.id, user.id);
      if (result.success) {
        await loadData();
      } else {
        alert("Erro ao excluir: " + result.error);
      }
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    } finally {
      setExcluindo(null);
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

  return (
    <>
      {(listas.length > 0 || resultados.length > 0) && (
        <div className="mb-4 flex justify-end gap-2">
          {resultados.length > 0 && (
            <button
              onClick={() => setIsStatsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
            >
              <TrendingUp className="h-4 w-4" /> Ver estatísticas
            </button>
          )}
          {listas.length > 0 && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
            >
              <Plus className="h-4 w-4" /> Importar lista
            </button>
          )}
        </div>
      )}

      {listas.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-display text-sm font-semibold">Nenhuma lista ainda</h3>
          <p className="mt-1 max-w-xs text-xs text-foreground/45">
            Importe um arquivo JSON para criar sua primeira lista de fixação.
          </p>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Importar lista
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {listas.map((l) => {
            const ultimo = ultimosResultados[l.id];
            const temResultado = !!ultimo;
            const pct = ultimo?.porcentagem || 0;

            return (
              <article key={l.id} className="rf-card rf-card-hover flex flex-col p-5">
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
                      onClick={() => handleExcluir(l)}
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

                <div className="mt-5 flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/listas/${l.id}`)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    {temResultado ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {temResultado ? "Refazer" : "Iniciar"}
                  </button>
                  {temResultado && (
                    <button
                      onClick={() => setHistoricoLista(l)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                      title="Histórico"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setGerenciandoLista(l)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                    title="Gerenciar questões"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditandoLista(l)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface"
                    title="Editar lista"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isImportModalOpen && (
        <ImportListaModal
          userId={user?.id || ""}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            setIsImportModalOpen(false);
            loadData();
          }}
        />
      )}

      {isStatsModalOpen && (
        <EstatisticasListasModal
          listas={listas}
          resultados={resultados}
          onClose={() => setIsStatsModalOpen(false)}
        />
      )}

      {historicoLista && (
        <HistoricoListaModal
          lista={historicoLista}
          resultados={resultados.filter((r) => r.lista_id === historicoLista.id)}
          onClose={() => setHistoricoLista(null)}
        />
      )}

      {editandoLista && (
        <EditarListaModal
          lista={editandoLista}
          userId={user?.id || ""}
          onClose={() => setEditandoLista(null)}
          onSuccess={() => {
            setEditandoLista(null);
            loadData();
          }}
        />
      )}

      {gerenciandoLista && (
        <GerenciarQuestoesModal
          lista={gerenciandoLista}
          userId={user?.id || ""}
          onClose={() => setGerenciandoLista(null)}
          onListaAlterada={() => loadData()}
        />
      )}
    </>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
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
          <div className="space-y-2">
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
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE IMPORTAÇÃO
// ============================================================

function ImportListaModal({
  userId,
  onClose,
  onSuccess,
}: {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [disciplineId, setDisciplineId] = useState("");
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loadingDisciplines, setLoadingDisciplines] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!userId) {
        setLoadingDisciplines(false);
        return;
      }
      const result = await getDisciplinesAuth(userId);
      if (result.success && result.data) {
        setDisciplines(result.data);
        if (result.data.length > 0) {
          setDisciplineId(result.data[0].id);
        }
      }
      setLoadingDisciplines(false);
    };
    load();
  }, [userId]);

  const handleImport = async () => {
    setError(null);

    if (password !== "admin123") {
      setError("Senha incorreta");
      return;
    }
    if (!file) {
      setError("Selecione um arquivo JSON");
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
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await importarLista(json, userId, disciplineId, imageFiles);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1200);
      } else {
        setError(result.error || "Erro ao importar lista");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao processar arquivo");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Importar lista (JSON)</h3>
          <button
            onClick={onClose}
            className="text-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <p className="mt-3 text-sm font-medium text-foreground">Lista importada com sucesso!</p>
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
                  onChange={(e) => setDisciplineId(e.target.value)}
                  disabled={importing}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
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
              <label className="text-sm font-medium text-foreground/70">Arquivo JSON *</label>
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setError(null);
                }}
                disabled={importing}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"
              />
              <p className="mt-1 text-xs text-foreground/40">
                O JSON deve seguir o formato de listas (com campo <code>tipo</code> em cada questão).
              </p>
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
                Se o JSON das questões tiver o campo <code>imagem: "arquivo.jpg"</code>, selecione aqui o arquivo correspondente. Aceita JPEG, PNG e WebP (máx. 2 MB cada).
              </p>

              {imageFiles.length > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-surface/40 p-2">
                  <p className="text-[11px] font-medium text-foreground/60 mb-1">
                    {imageFiles.length} {imageFiles.length === 1 ? 'imagem selecionada' : 'imagens selecionadas'}:
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
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importing || disciplines.length === 0}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Importar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}