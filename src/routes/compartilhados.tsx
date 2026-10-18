// src/routes/compartilhados.tsx
//
// Tela "Compartilhado comigo" (somente leitura).
// Mostra o que AMIGAS compartilharam com você: disciplinas/tópicos/arquivos,
// listas de questões e simulados. Lê só do banco local do aparelho
// (o sharedSync é quem baixa e remove o que mudou).
// Nada aqui altera o conteúdo da dona; grifos, respostas e resultados
// continuam só seus.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList, Copy, FileText, Folder, Loader2, RefreshCw, Share2,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { copiarDisciplinaParaMinhaConta } from "@/services/copiaConteudoService";
import { AppShell } from "@/components/app-shell";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import { getDb } from "@/lib/db";
import { syncSharedContent } from "@/lib/sharedSync";
import { findUsersByIds } from "@/services/clerkService";

type Row = Record<string, any>;

interface ArquivoItem {
  id: string;
  nome: string;
  tipo: string;
  donoId: string;
}

interface TopicoItem {
  id: string;
  nome: string;
  arquivos: ArquivoItem[];
}

interface GrupoDisciplina {
  key: string;
  nome: string;
  donos: Set<string>;
  topicos: Map<string, TopicoItem>;
}

interface ListaItem {
  id: string;
  titulo: string;
  donoId: string;
  total: number;
}

interface SimuladoItem {
  id: string;
  titulo: string;
  detalhe: string;
  donoId: string;
  total: number;
}

interface Dados {
  grupos: GrupoDisciplina[];
  listas: ListaItem[];
  simulados: SimuladoItem[];
  nomes: Map<string, string>;
}

const AVULSOS = "__avulsos__";

const apagado = (r: Row) =>
  r.isDeleted === true || r.isdeleted === true;

const deOutra = (r: Row, campoDono: string, eu: string) =>
  typeof r[campoDono] === "string" && r[campoDono] !== "" && r[campoDono] !== eu;

async function lerTudo(colecao: any): Promise<Row[]> {
  if (!colecao) return [];
  const docs = await colecao.find().exec();
  return docs.map((d: any) => d.toJSON() as Row);
}

async function carregarDados(eu: string): Promise<Dados> {
  const db: any = await getDb();

  const [disciplinas, topicos, arquivos, listas, simulados] = await Promise.all([
    lerTudo(db.collections.disciplines),
    lerTudo(db.collections.topics),
    lerTudo(db.collections.files),
    lerTudo(db.collections.listas),
    lerTudo(db.collections.simulados),
  ]);

  const discsOutras = disciplinas.filter((r) => deOutra(r, "user_id", eu) && !apagado(r));
  const topsOutras = topicos.filter((r) => deOutra(r, "user_id", eu) && !apagado(r));
  const arqsOutras = arquivos.filter((r) => deOutra(r, "user_id", eu) && !apagado(r));
  const listasOutras = listas.filter((r) => deOutra(r, "user_id", eu) && !apagado(r));
  const simsOutras = simulados.filter((r) => deOutra(r, "created_by", eu) && !apagado(r));

  // ---------- contagem de questões ----------
  const totalPorLista = new Map<string, number>();
  if (listasOutras.length > 0 && db.collections.listas_questoes) {
    const ids = listasOutras.map((l) => String(l.id));
    const vinculos = await lerTudo(db.collections.listas_questoes);
    for (const v of vinculos) {
      if (!ids.includes(String(v.lista_id)) || apagado(v)) continue;
      totalPorLista.set(String(v.lista_id), (totalPorLista.get(String(v.lista_id)) || 0) + 1);
    }
  }
  const totalPorSimulado = new Map<string, number>();
  if (simsOutras.length > 0 && db.collections.questoes) {
    const ids = new Set(simsOutras.map((s) => String(s.id)));
    const questoes = await lerTudo(db.collections.questoes);
    for (const q of questoes) {
      if (!ids.has(String(q.simulado_id)) || apagado(q)) continue;
      totalPorSimulado.set(String(q.simulado_id), (totalPorSimulado.get(String(q.simulado_id)) || 0) + 1);
    }
  }

  // ---------- disciplinas → tópicos → arquivos ----------
  const grupos = new Map<string, GrupoDisciplina>();
  const grupo = (key: string, nome: string): GrupoDisciplina => {
    let g = grupos.get(key);
    if (!g) {
      g = { key, nome, donos: new Set(), topicos: new Map() };
      grupos.set(key, g);
    }
    return g;
  };

  for (const d of discsOutras) {
    const g = grupo(`d:${d.id}`, d.name || "Disciplina");
    g.donos.add(String(d.user_id));
  }

  const topicoPorId = new Map<string, { grupo: GrupoDisciplina; item: TopicoItem }>();
  for (const t of topsOutras) {
    const discId = t.discipline_id ? `d:${t.discipline_id}` : "";
    // Tópico compartilhado sozinho chega sem a disciplina → "Avulsos"
    const g = discId && grupos.has(discId) ? grupos.get(discId)! : grupo(AVULSOS, "Avulsos");
    g.donos.add(String(t.user_id));
    const item: TopicoItem = { id: String(t.id), nome: t.name || "Tópico", arquivos: [] };
    g.topicos.set(item.id, item);
    topicoPorId.set(item.id, { grupo: g, item });
  }

  for (const f of arqsOutras) {
    const arq: ArquivoItem = {
      id: String(f.id),
      nome: f.nome || "Arquivo",
      tipo: f.tipo || "",
      donoId: String(f.user_id),
    };
    const ref = topicoPorId.get(String(f.topico_id));
    if (ref) {
      ref.item.arquivos.push(arq);
      ref.grupo.donos.add(arq.donoId);
      continue;
    }
    // Arquivo compartilhado sozinho: agrupa pelo nome da disciplina que vem nele
    const nomeDisc = typeof f.disciplina === "string" ? f.disciplina.trim() : "";
    const g = nomeDisc ? grupo(`n:${nomeDisc.toLowerCase()}`, nomeDisc) : grupo(AVULSOS, "Avulsos");
    g.donos.add(arq.donoId);
    let solto = g.topicos.get("__soltos__");
    if (!solto) {
      solto = { id: "__soltos__", nome: "Arquivos", arquivos: [] };
      g.topicos.set(solto.id, solto);
    }
    solto.arquivos.push(arq);
  }

  const listaGrupos = [...grupos.values()].sort((a, b) => {
    if (a.key === AVULSOS) return 1;
    if (b.key === AVULSOS) return -1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const listasItens: ListaItem[] = listasOutras
    .map((l) => ({
      id: String(l.id),
      titulo: l.titulo || "Lista",
      donoId: String(l.user_id),
      total: totalPorLista.get(String(l.id)) || 0,
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

  const simuladosItens: SimuladoItem[] = simsOutras
    .map((s) => ({
      id: String(s.id),
      titulo: s.titulo || "Simulado",
      detalhe: [s.banca, s.ano, s.area].filter(Boolean).join(" · "),
      donoId: String(s.created_by),
      total: totalPorSimulado.get(String(s.id)) || 0,
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

  // ---------- nomes de quem compartilhou (só pessoas conhecidas) ----------
  const donoIds = new Set<string>();
  grupos.forEach((g) => g.donos.forEach((d) => donoIds.add(d)));
  listasItens.forEach((l) => donoIds.add(l.donoId));
  simuladosItens.forEach((s) => donoIds.add(s.donoId));

  const nomes = new Map<string, string>();
  if (donoIds.size > 0) {
    try {
      const pessoas = await findUsersByIds([...donoIds]);
      for (const p of pessoas) {
        const nome = p.name || p.email;
        if (nome) nomes.set(p.id, nome);
      }
    } catch (e) {
      console.warn("⚠️ [Compartilhados] Não foi possível buscar nomes:", e);
    }
  }

  return { grupos: listaGrupos, listas: listasItens, simulados: simuladosItens, nomes };
}

export default function CompartilhadosPage() {
  const { userId } = useAppUser();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [copiandoKey, setCopiandoKey] = useState<string | null>(null);
  const [progressoCopia, setProgressoCopia] = useState("");
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!userId) return;
    try {
      setDados(await carregarDados(userId));
      setErro(null);
    } catch (e) {
      console.error("❌ [Compartilhados] Erro ao ler dados locais:", e);
      setErro("Não foi possível mostrar o conteúdo compartilhado agora.");
    } finally {
      setCarregando(false);
    }
  }, [userId]);

  // Mostra o que já está no aparelho e, em seguida, busca novidades no servidor.
  useEffect(() => {
    if (!userId) return;
    let cancelado = false;
    (async () => {
      await recarregar();
      try {
        await syncSharedContent(userId);
      } catch (e) {
        console.warn("⚠️ [Compartilhados] Falha ao sincronizar:", e);
      }
      if (!cancelado) await recarregar();
    })();
    return () => {
      cancelado = true;
    };
  }, [userId, recarregar]);

  // Ao voltar para a aba, atualiza
  useEffect(() => {
    if (!userId) return;
    const aoVoltar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await syncSharedContent(userId);
      } catch {
        /* segue com o que já está no aparelho */
      }
      await recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [userId, recarregar]);

  const handleAtualizar = async () => {
    if (!userId || atualizando) return;
    setAtualizando(true);
    try {
      const ok = await syncSharedContent(userId, true);
      await recarregar();
      if (ok) toast.success("Conteúdo atualizado");
      else toast.error("Não foi possível atualizar tudo. Tente de novo em instantes.");
    } catch {
      toast.error("Falha ao atualizar");
    } finally {
      setAtualizando(false);
    }
  };

  const nomeDe = (id: string) => dados?.nomes.get(id) || "uma amiga";
  const nomesDe = (ids: Set<string>) =>
    [...ids].map(nomeDe).filter((n, i, a) => a.indexOf(n) === i).join(", ");

  const vazio =
    !!dados && dados.grupos.length === 0 && dados.listas.length === 0 && dados.simulados.length === 0;

  // Copia a disciplina (com tópicos e PDFs) para a conta de quem está logada.
  const handleCopiarDisciplina = async (g: GrupoDisciplina) => {
    if (!userId || copiandoKey) return;
    const topicosParaCopiar = [...g.topicos.values()].map((t) => ({
      nome: t.nome,
      arquivoIds: t.arquivos.map((a) => a.id),
    }));
    const totalArquivos = topicosParaCopiar.reduce((soma, t) => soma + t.arquivoIds.length, 0);

    const ok = await confirmDialog({
      title: "Copiar para a sua conta?",
      description: `Você recebe uma cópia só sua de "${g.nome}", com ${topicosParaCopiar.length} tópico(s) e ${totalArquivos} PDF(s). Os PDFs são baixados e enviados de novo, o que pode demorar e gastar internet. A cópia continua existindo mesmo que a dona apague o original.`,
      confirmText: "Copiar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setCopiandoKey(g.key);
    setProgressoCopia("Começando...");
    try {
      const res = await copiarDisciplinaParaMinhaConta(g.nome, topicosParaCopiar, userId, setProgressoCopia);
      if (!res.success) {
        toast.error(res.error || "Não consegui copiar agora.");
      } else if (res.arquivosComFalha > 0) {
        toast.error(
          `Copiei a disciplina e ${res.arquivosCopiados} PDF(s), mas ${res.arquivosComFalha} PDF(s) falharam. Veja em Conteúdo.`
        );
      } else {
        toast.success(
          `Copiado! Veja em Conteúdo: ${res.topicosCriados} tópico(s) e ${res.arquivosCopiados} PDF(s).`
        );
      }
    } finally {
      setCopiandoKey(null);
      setProgressoCopia("");
    }
  };

  return (
    <AppShell breadcrumb="Compartilhado comigo" title="Compartilhado comigo">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-foreground/60">
            Conteúdo que suas amigas compartilharam com você. Você pode ler e responder, mas não
            alterar o original. Seus grifos, respostas e resultados ficam só com você.
          </p>
          <button
            type="button"
            onClick={handleAtualizar}
            disabled={atualizando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface disabled:opacity-50"
          >
            {atualizando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Atualizar
          </button>
        </div>

        {carregando && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        {!carregando && !erro && vazio && (
          <div className="rf-card p-6 text-center">
            <Share2 className="mx-auto mb-2 h-6 w-6 text-foreground/40" />
            <p className="text-sm font-medium">Nada compartilhado com você ainda.</p>
            <p className="mt-1 text-xs text-foreground/50">
              Quando uma amiga compartilhar algo, aparece aqui depois de atualizar.
            </p>
          </div>
        )}

        {/* ---------- Disciplinas, tópicos e arquivos ---------- */}
        {dados && dados.grupos.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <Folder className="h-4 w-4 text-primary" /> Disciplinas e arquivos
            </h2>
            {dados.grupos.map((g) => {
              const topicos = [...g.topicos.values()];
              return (
                <div key={g.key} className="rf-card p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{g.nome}</p>
                      <p className="text-xs text-foreground/50">de {nomesDe(g.donos)}</p>
                    </div>
                    {topicos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleCopiarDisciplina(g)}
                        disabled={copiandoKey !== null}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface disabled:opacity-50"
                      >
                        {copiandoKey === g.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copiar
                      </button>
                    )}
                  </div>
                  {copiandoKey === g.key && progressoCopia && (
                    <p className="mb-2 text-xs text-foreground/60">{progressoCopia}</p>
                  )}
                  {topicos.length === 0 && (
                    <p className="text-xs text-foreground/50">Nenhum tópico ou arquivo ainda.</p>
                  )}
                  <div className="space-y-3">
                    {topicos.map((t) => (
                      <div key={t.id}>
                        <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                          {t.nome}
                        </p>
                        {t.arquivos.length === 0 ? (
                          <p className="mt-1 text-xs text-foreground/40">Sem arquivos.</p>
                        ) : (
                          <ul className="mt-1 divide-y divide-border">
                            {t.arquivos.map((a) => (
                              <li key={a.id}>
                                <Link
                                  to={`/pdf/${a.id}`}
                                  className="flex items-center gap-2 py-2 text-sm hover:text-primary"
                                >
                                  <FileText className="h-4 w-4 shrink-0 text-foreground/50" />
                                  <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ---------- Listas de questões ---------- */}
        {dados && dados.listas.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <ClipboardList className="h-4 w-4 text-primary" /> Listas de questões
            </h2>
            <ul className="space-y-2">
              {dados.listas.map((l) => (
                <li key={l.id}>
                  <Link to={`/listas/${l.id}`} className="rf-card rf-card-hover block p-4">
                    <p className="text-sm font-semibold">{l.titulo}</p>
                    <p className="text-xs text-foreground/50">
                      de {nomeDe(l.donoId)}
                      {l.total > 0 && ` · ${l.total} ${l.total === 1 ? "questão" : "questões"}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Simulados ---------- */}
        {dados && dados.simulados.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <FileText className="h-4 w-4 text-primary" /> Simulados
            </h2>
            <ul className="space-y-2">
              {dados.simulados.map((s) => (
                <li key={s.id}>
                  <Link to={`/simulados/${s.id}`} className="rf-card rf-card-hover block p-4">
                    <p className="text-sm font-semibold">{s.titulo}</p>
                    <p className="text-xs text-foreground/50">
                      de {nomeDe(s.donoId)}
                      {s.detalhe && ` · ${s.detalhe}`}
                      {s.total > 0 && ` · ${s.total} ${s.total === 1 ? "questão" : "questões"}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}