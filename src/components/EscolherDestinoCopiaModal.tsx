// src/components/EscolherDestinoCopiaModal.tsx
import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { getDb } from "@/lib/db";
import { getPastas } from "@/services/listaService";
import type { Pasta } from "@/lib/listas-types";

interface Discipline { id: string; name: string; }
interface Topico { id: string; name: string; discipline_id: string; }

export type TipoDestino = "lista" | "conteudo";

export interface ResultadoEscolha {
  disciplinaId: string | null;
  nomeNovaDisciplina?: string;
  folderId?: string | null;
  topicoId?: string | null;
  nomeNovoTopico?: string;
}

interface Props {
  tipo: TipoDestino;
  nomeItem: string;
  userId: string;
  onConfirm: (destino: ResultadoEscolha) => void;
  onCancel: () => void;
}

export function EscolherDestinoCopiaModal({ tipo, nomeItem, userId, onConfirm, onCancel }: Props) {
  const [disciplinas, setDisciplinas] = useState<Discipline[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modoDisciplina, setModoDisciplina] = useState<"existing" | "new">("existing");
  const [disciplinaSelecionada, setDisciplinaSelecionada] = useState<string | null>(null);
  const [nomeNovaDisciplina, setNomeNovaDisciplina] = useState("");

  const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);

  const [modoTopico, setModoTopico] = useState<"existing" | "new">("new");
  const [topicoSelecionado, setTopicoSelecionado] = useState<string | null>(null);
  const [nomeNovoTopico, setNomeNovoTopico] = useState("");

  // Carrega disciplinas do usuário
  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const docs = await db.disciplines.find({
          selector: { user_id: userId, isDeleted: { $ne: true } },
        }).exec();
        const data = docs
          .map((d: any) => ({ id: d.id, name: d.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setDisciplinas(data);
        if (data.length > 0) setDisciplinaSelecionada(data[0].id);
        else setModoDisciplina("new");
      } catch (e: any) {
        setErro("Erro ao carregar disciplinas: " + e.message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [userId]);

  // Carrega pastas (lista) ou tópicos (conteúdo) da disciplina selecionada
  useEffect(() => {
    if (modoDisciplina !== "existing" || !disciplinaSelecionada) {
      setPastas([]);
      setTopicos([]);
      return;
    }
    (async () => {
      try {
        if (tipo === "lista") {
          const res = await getPastas(userId, disciplinaSelecionada);
          setPastas(res.success && res.data ? res.data : []);
        } else {
          const db = await getDb();
          const docs = await db.topics.find({
            selector: { discipline_id: disciplinaSelecionada, isDeleted: { $ne: true } },
          }).exec();
          const data = docs
            .map((d: any) => ({ id: d.id, name: d.name, discipline_id: d.discipline_id }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setTopicos(data);
          if (data.length > 0) {
            setModoTopico("existing");
            setTopicoSelecionado(data[0].id);
          } else {
            setModoTopico("new");
          }
        }
      } catch (e) {
        console.warn("[EscolherDestino] Erro ao carregar sub-itens:", e);
      }
    })();
  }, [userId, disciplinaSelecionada, modoDisciplina, tipo]);

  // Se está criando disciplina nova, força "novo tópico"
  useEffect(() => {
    if (modoDisciplina === "new" && tipo === "conteudo") {
      setModoTopico("new");
    }
  }, [modoDisciplina, tipo]);

  const confirmar = () => {
    setErro(null);

    if (modoDisciplina === "new") {
      if (!nomeNovaDisciplina.trim()) {
        setErro("Digite um nome para a nova disciplina.");
        return;
      }
      if (tipo === "conteudo" && !nomeNovoTopico.trim()) {
        setErro("Digite um nome para o novo tópico.");
        return;
      }
      onConfirm({
        disciplinaId: null,
        nomeNovaDisciplina: nomeNovaDisciplina.trim(),
        topicoId: null,
        nomeNovoTopico: tipo === "conteudo" ? nomeNovoTopico.trim() : undefined,
        folderId: null,
      });
      return;
    }

    if (!disciplinaSelecionada) {
      setErro("Selecione uma disciplina.");
      return;
    }

    if (tipo === "conteudo") {
      if (modoTopico === "new" && !nomeNovoTopico.trim()) {
        setErro("Digite um nome para o novo tópico.");
        return;
      }
      onConfirm({
        disciplinaId: disciplinaSelecionada,
        topicoId: modoTopico === "existing" ? topicoSelecionado : null,
        nomeNovoTopico: modoTopico === "new" ? nomeNovoTopico.trim() : undefined,
      });
      return;
    }

    // tipo === "lista"
    onConfirm({
      disciplinaId: disciplinaSelecionada,
      folderId: pastaSelecionada,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground">Onde guardar a cópia?</h3>
            <p className="text-xs text-foreground/50 truncate">{nomeItem}</p>
          </div>
          <button onClick={onCancel} className="shrink-0 text-foreground/50 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {carregando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Disciplina */}
            <div>
              <label className="text-sm font-medium text-foreground/70 mb-2 block">Disciplina</label>
              <div className="space-y-1">
                {disciplinas.length > 0 && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 hover:bg-surface-2">
                    <input
                      type="radio"
                      checked={modoDisciplina === "existing"}
                      onChange={() => setModoDisciplina("existing")}
                    />
                    <span className="text-sm">Usar disciplina existente</span>
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 hover:bg-surface-2">
                  <input
                    type="radio"
                    checked={modoDisciplina === "new"}
                    onChange={() => setModoDisciplina("new")}
                  />
                  <span className="text-sm">Criar nova disciplina</span>
                </label>
              </div>

              {modoDisciplina === "existing" && (
                <select
                  value={disciplinaSelecionada || ""}
                  onChange={(e) => {
                    setDisciplinaSelecionada(e.target.value || null);
                    setPastaSelecionada(null);
                    setTopicoSelecionado(null);
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {disciplinas.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}

              {modoDisciplina === "new" && (
                <input
                  type="text"
                  value={nomeNovaDisciplina}
                  onChange={(e) => setNomeNovaDisciplina(e.target.value)}
                  placeholder="Ex: Cardiologia"
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              )}
            </div>

            {/* Lista: pasta */}
            {tipo === "lista" && modoDisciplina === "existing" && (
              <div>
                <label className="text-sm font-medium text-foreground/70 mb-2 block">Pasta (opcional)</label>
                <select
                  value={pastaSelecionada || ""}
                  onChange={(e) => setPastaSelecionada(e.target.value || null)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Sem pasta (direto na disciplina)</option>
                  {pastas.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Conteúdo: tópico */}
            {tipo === "conteudo" && (
              <div>
                <label className="text-sm font-medium text-foreground/70 mb-2 block">Tópico</label>
                {modoDisciplina === "existing" && topicos.length > 0 && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 hover:bg-surface-2 mb-1">
                    <input
                      type="radio"
                      checked={modoTopico === "existing"}
                      onChange={() => setModoTopico("existing")}
                    />
                    <span className="text-sm">Usar tópico existente</span>
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 hover:bg-surface-2">
                  <input
                    type="radio"
                    checked={modoTopico === "new"}
                    onChange={() => setModoTopico("new")}
                  />
                  <span className="text-sm">Criar novo tópico</span>
                </label>

                {modoTopico === "existing" && modoDisciplina === "existing" && topicos.length > 0 && (
                  <select
                    value={topicoSelecionado || ""}
                    onChange={(e) => setTopicoSelecionado(e.target.value || null)}
                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {topicos.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}

                {modoTopico === "new" && (
                  <input
                    type="text"
                    value={nomeNovoTopico}
                    onChange={(e) => setNomeNovoTopico(e.target.value)}
                    placeholder="Ex: Insuficiência cardíaca"
                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                )}
              </div>
            )}

            {erro && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {erro}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onCancel}
                className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground/65 hover:bg-surface-2"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Copiar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}