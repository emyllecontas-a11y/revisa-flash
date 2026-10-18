// src/routes/compartilhados.tsx
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList, Copy, FileText, Folder, Loader2, RefreshCw, Share2,
  CheckSquare, Square,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  copiarDisciplinaParaMinhaConta,
  copiarListaParaMinhaConta,
  copiarSimuladoParaMinhaConta,
  copiarTopicosParaDisciplina,
  type ProgressoCopia,
} from "@/services/copiaConteudoService";
import { AppShell } from "@/components/app-shell";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import { getDb } from "@/lib/db";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { syncSharedContent } from "@/lib/sharedSync";
import { findUsersByIds } from "@/services/clerkService";
import { uid } from "@/utils/helpers";
import { enqueueOperation } from "@/services/queueService";
import {
  EscolherDestinoCopiaModal,
  type TipoDestino,
  type ResultadoEscolha,
} from "@/components/EscolherDestinoCopiaModal";

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

interface PendingCopy {
  tipo: TipoDestino;
  nomeItem: string;
  executar: (destino: ResultadoEscolha) => Promise<void>;
}

const AVULSOS = "__avulsos__";

const apagado = (r: Row) => r.isDeleted === true || r.isdeleted === true;
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
    const g = discId && grupos.has(discId) ? grupos.get(discId)! : grupo(AVULSOS, "Avulsos");
    g.donos.add(String(t.user_id));
    const item: TopicoItem = { id: String(t.id), nome: t.name || "Tópico", arquivos: [] };
    g.topicos.set(item.id, item);
    topicoPorId.set(item.id, { grupo: g, item });
  }

  for (const f of arqsOutras) {
    const arq: ArquivoItem = { id: String(f.id), nome: f.nome || "Arquivo", tipo: f.tipo || "", donoId: String(f.user_id) };
    const ref = topicoPorId.get(String(f.topico_id));
    if (ref) {
      ref.item.arquivos.push(arq);
      ref.grupo.donos.add(arq.donoId);
      continue;
    }
    const nomeDisc = typeof f.disciplina === "string" ? f.disciplina.trim() : "";
    const g = nomeDisc ? grupo(`n:${nomeDisc.toLowerCase()}`, nomeDisc) : grupo(AVULSOS, "Avulsos");
    g.donos.add(arq.donoId);
    let solto = g.topicos.get("__soltos__");
    if (!solto) {
      solto = { id: "__soltos__", nome: "Arquivos Soltos", arquivos: [] };
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

// ============================================================
// CONTEÚDO
// ============================================================
export function CompartilhadosConteudo() {
  const { userId } = useAppUser();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [copiandoKey, setCopiandoKey] = useState<string | null>(null);
  const [progressoCopia, setProgressoCopia] = useState<ProgressoCopia | null>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  // Seleção múltipla de listas (para copiar em bloco)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [pendingBloco, setPendingBloco] = useState(false);
  const [copiandoBloco, setCopiandoBloco] = useState<{ atual: number; total: number } | null>(null);

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
    return () => { cancelado = true; };
  }, [userId, recarregar]);

  useEffect(() => {
    if (!userId) return;
    const aoVoltar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await syncSharedContent(userId);
      } catch { /* segue com o que já está no aparelho */ }
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

  const nomeDe = (id: string) => dados?.nomes.get(id) || "um amigo";
  const nomesDe = (ids: Set<string>) =>
    [...ids].map(nomeDe).filter((n, i, a) => a.indexOf(n) === i).join(", ");

  const vazio = !!dados && dados.grupos.length === 0 && dados.listas.length === 0 && dados.simulados.length === 0;

  const iniciarCopiaComDestino = (
    tipo: TipoDestino,
    nomeItem: string,
    executar: (destino: ResultadoEscolha) => Promise<void>
  ) => {
    setPendingCopy({ tipo, nomeItem, executar });
  };

  // -------- Copiar disciplina INTEIRA (sem escolha de destino; cria nova) --------
  const handleCopiarGrupo = async (g: GrupoDisciplina) => {
    if (!userId || copiandoKey) return;
    const topicosParaCopiar = [...g.topicos.values()].map((t) => ({
      nome: t.nome,
      arquivoIds: t.arquivos.map((a) => a.id),
    }));
    const totalArquivos = topicosParaCopiar.reduce((s, t) => s + t.arquivoIds.length, 0);

    const ok = await confirmDialog({
      title: "Copiar tudo para a sua conta?",
      description: `Você recebe uma cópia só sua de "${g.nome}", com ${topicosParaCopiar.length} tópico(s) e ${totalArquivos} PDF(s).`,
      confirmText: "Copiar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setCopiandoKey(g.key);
    setProgressoCopia({ current: 0, total: 1, label: "Começando..." });
    try {
      const res = await copiarDisciplinaParaMinhaConta(
        g.nome,
        topicosParaCopiar,
        userId,
        (info) => setProgressoCopia(info)
      );
      if (!res.success) toast.error(res.error || "Não consegui copiar agora.");
      else if (res.arquivosComFalha > 0) toast.error(`Copiei ${res.arquivosCopiados} PDF(s), mas ${res.arquivosComFalha} falharam.`);
      else toast.success(`Copiado! ${res.topicosCriados} tópico(s) e ${res.arquivosCopiados} PDF(s).`);
      await recarregar();
    } finally {
      setCopiandoKey(null);
      setTimeout(() => setProgressoCopia(null), 2000);
    }
  };

  // -------- Copiar TÓPICO (com escolha de destino) --------
  const handleCopiarTopico = async (g: GrupoDisciplina, t: TopicoItem) => {
    if (!userId || copiandoKey) return;
    iniciarCopiaComDestino("conteudo", t.nome, async (destino) => {
      setCopiandoKey(`topic:${t.id}`);
      setProgressoCopia({ current: 0, total: 1, label: "Começando..." });
      try {
        const res = await copiarTopicosParaDisciplina(
          userId,
          destino.disciplinaId,
          destino.nomeNovaDisciplina || g.nome,
          [{
            nomeOriginal: t.nome,
            arquivoIds: t.arquivos.map((a) => a.id),
            topicoDestinoId: destino.topicoId ?? null,
            nomeNovoTopico: destino.nomeNovoTopico,
          }],
          (info) => setProgressoCopia(info)
        );
        if (!res.success) toast.error(res.error || "Não consegui copiar agora.");
        else if (res.arquivosComFalha > 0) toast.error(`Copiei ${res.arquivosCopiados} PDF(s), mas ${res.arquivosComFalha} falharam.`);
        else toast.success(`Tópico copiado com ${res.arquivosCopiados} PDF(s)!`);
        await recarregar();
      } finally {
        setCopiandoKey(null);
        setTimeout(() => setProgressoCopia(null), 2000);
      }
    });
  };

  // -------- Copiar ARQUIVO (com escolha de destino) --------
  const handleCopiarArquivo = async (g: GrupoDisciplina, t: TopicoItem, a: ArquivoItem) => {
    if (!userId || copiandoKey) return;
    iniciarCopiaComDestino("conteudo", a.nome, async (destino) => {
      setCopiandoKey(`file:${a.id}`);
      setProgressoCopia({ current: 0, total: 1, label: "Baixando PDF..." });
      try {
        const res = await copiarTopicosParaDisciplina(
          userId,
          destino.disciplinaId,
          destino.nomeNovaDisciplina || g.nome,
          [{
            nomeOriginal: t.nome,
            arquivoIds: [a.id],
            topicoDestinoId: destino.topicoId ?? null,
            nomeNovoTopico: destino.nomeNovoTopico,
          }],
          (info) => setProgressoCopia(info)
        );
        if (!res.success) toast.error(res.error || "Não consegui copiar agora.");
        else if (res.arquivosComFalha > 0) toast.error("O PDF não pôde ser copiado.");
        else toast.success("PDF copiado!");
        await recarregar();
      } finally {
        setCopiandoKey(null);
        setTimeout(() => setProgressoCopia(null), 2000);
      }
    });
  };

  // -------- Copiar LISTA (com escolha de destino) --------
  const handleCopiarLista = async (l: ListaItem) => {
    if (!userId || copiandoKey) return;
    iniciarCopiaComDestino("lista", l.titulo, async (destino) => {
      setCopiandoKey(`lista:${l.id}`);
      setProgressoCopia({ current: 0, total: 1, label: "Começando..." });
      try {
        const res = await copiarListaParaMinhaConta(
          l.id,
          userId,
          (info) => setProgressoCopia(info),
          {
            disciplinaId: destino.disciplinaId,
            nomeNovaDisciplina: destino.nomeNovaDisciplina,
            folderId: destino.folderId ?? null,
          }
        );
        if (res.success) toast.success(`Lista copiada com ${res.questoesCopiadas} questões!`);
        else toast.error(res.error || "Erro ao copiar lista.");
        await recarregar();
      } finally {
        setCopiandoKey(null);
        setTimeout(() => setProgressoCopia(null), 2000);
      }
    });
  };
  // ============================================================
  // SELEÇÃO MÚLTIPLA / CÓPIA EM BLOCO
  // ============================================================
  const toggleSelecionada = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodas = () => {
    if (!dados) return;
    setSelecionadas(new Set(dados.listas.map((l) => l.id)));
  };

  const limparSelecao = () => setSelecionadas(new Set());

  const copiarEmBloco = () => {
    if (selecionadas.size === 0 || copiandoKey || copiandoBloco) return;
    setPendingBloco(true);
  };

  const executarCopiaEmBloco = async (destino: ResultadoEscolha) => {
    setPendingBloco(false);
    if (!userId || selecionadas.size === 0) return;

    const ids = [...selecionadas];
    const total = ids.length;
    setCopiandoBloco({ atual: 0, total });

    // Se o destino é "criar nova disciplina", cria UMA vez e reusa
    let disciplinaId = destino.disciplinaId;
    if (!disciplinaId && destino.nomeNovaDisciplina) {
      setProgressoCopia({ current: 0, total, label: `Criando disciplina "${destino.nomeNovaDisciplina}"...` });
      try {
        const db = await getDb();
        const novaDiscId = uid();
        const agora = new Date().toISOString();
        const novaDisc = {
          id: novaDiscId,
          name: destino.nomeNovaDisciplina,
          user_id: userId,
          createdAt: agora,
          updated_at: agora,
          isDeleted: false,
        };
        await db.disciplines.insert(novaDisc);
        try {
          const supabaseClient = await getSupabaseWithToken();
          const { error } = await supabaseClient.from('disciplines').insert(novaDisc);
          if (error) throw error;
        } catch {
          await enqueueOperation('create', 'disciplines', novaDisc);
        }
        disciplinaId = novaDiscId;
      } catch (e) {
        console.error('[cópia em bloco] Erro ao criar disciplina:', e);
        toast.error('Não foi possível criar a disciplina.');
        setCopiandoBloco(null);
        setProgressoCopia(null);
        return;
      }
    }

    let sucesso = 0;
    let falhas = 0;
    for (let i = 0; i < ids.length; i++) {
      setCopiandoBloco({ atual: i + 1, total });
      setProgressoCopia({ current: i, total, label: `Copiando lista ${i + 1} de ${total}...` });
      try {
        const res = await copiarListaParaMinhaConta(
          ids[i],
          userId,
          (info) => setProgressoCopia(info),
          {
            disciplinaId: disciplinaId ?? null,
            folderId: destino.folderId ?? null,
          }
        );
        if (res.success) sucesso++;
        else falhas++;
      } catch {
        falhas++;
      }
    }

    setCopiandoBloco(null);
    setProgressoCopia(null);

    if (falhas === 0) toast.success(`${sucesso} lista(s) copiada(s)!`);
    else if (sucesso > 0) toast.warning(`${sucesso} copiada(s), ${falhas} falharam.`);
    else toast.error('Nenhuma lista pôde ser copiada.');

    setSelecionadas(new Set());
    await recarregar();
  };

  const handleCopiarSimulado = async (s: SimuladoItem) => {
  // -------- Copiar SIMULADO (sem escolha de destino) --------
  const handleCopiarSimulado = async (s: SimuladoItem) => {
    if (!userId || copiandoKey) return;
    const ok = await confirmDialog({
      title: "Copiar simulado para a sua conta?",
      description: `Você recebe uma cópia só sua de "${s.titulo}" com ${s.total} questão(ões). O histórico de resultados do dono não é copiado.`,
      confirmText: "Copiar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setCopiandoKey(`simulado:${s.id}`);
    setProgressoCopia({ current: 0, total: 1, label: "Começando..." });
    try {
      const res = await copiarSimuladoParaMinhaConta(
        s.id,
        userId,
        (info) => setProgressoCopia(info)
      );
      if (res.success) toast.success(`Simulado copiado com ${res.questoesCopiadas} questões!`);
      else toast.error(res.error || "Erro ao copiar simulado.");
      await recarregar();
    } finally {
      setCopiandoKey(null);
      setTimeout(() => setProgressoCopia(null), 2000);
    }
  };

  const pctProgresso = progressoCopia && progressoCopia.total > 0
    ? Math.min(100, Math.round((progressoCopia.current / progressoCopia.total) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-foreground/60">
          Conteúdo que seus amigos compartilharam com você. Você pode ler e responder, mas não
          alterar o original. Seus grifos, respostas e resultados ficam só com você.
        </p>
        <button
          type="button"
          onClick={handleAtualizar}
          disabled={atualizando}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-surface disabled:opacity-50"
        >
          {atualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      {progressoCopia && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-center justify-between mb-2 gap-2 text-sm text-primary">
            <div className="flex min-w-0 items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="truncate">{progressoCopia.label}</span>
            </div>
            <span className="text-xs font-semibold tabular-nums shrink-0">{pctProgresso}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pctProgresso}%` }}
            />
          </div>
          {progressoCopia.total > 0 && (
            <div className="mt-1 text-[10px] text-primary/70 text-right tabular-nums">
              {progressoCopia.current} de {progressoCopia.total}
            </div>
          )}
        </div>
      )}

      {carregando && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

      {erro && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

      {!carregando && !erro && vazio && (
        <div className="rf-card p-6 text-center">
          <Share2 className="mx-auto mb-2 h-6 w-6 text-foreground/40" />
          <p className="text-sm font-medium">Nada compartilhado com você ainda.</p>
        </div>
      )}

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
                      onClick={() => handleCopiarGrupo(g)}
                      disabled={copiandoKey !== null}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface disabled:opacity-50"
                      title="Copiar tudo"
                    >
                      {copiandoKey === g.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                      Copiar Tudo
                    </button>
                  )}
                </div>

                <div className="space-y-3 mt-3">
                  {topicos.map((t) => (
                    <div key={t.id} className="border-t border-border/50 pt-3 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                          {t.nome}
                        </p>
                        {t.arquivos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleCopiarTopico(g, t)}
                            disabled={copiandoKey !== null}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            {copiandoKey === `topic:${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                            Copiar tópico
                          </button>
                        )}
                      </div>

                      {t.arquivos.length === 0 ? (
                        <p className="text-xs text-foreground/40 italic">Sem arquivos.</p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {t.arquivos.map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                              <Link
                                to={`/pdf/${a.id}`}
                                className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-primary"
                              >
                                <FileText className="h-4 w-4 shrink-0 text-foreground/50" />
                                <span className="truncate">{a.nome}</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleCopiarArquivo(g, t, a)}
                                disabled={copiandoKey !== null}
                                className="shrink-0 text-[10px] font-medium text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                              >
                                {copiandoKey === `file:${a.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                                Copiar PDF
                              </button>
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

      {dados && dados.listas.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <ClipboardList className="h-4 w-4 text-primary" /> Listas de questões
            </h2>
            <div className="flex items-center gap-1.5">
              {selecionadas.size === 0 ? (
                <button
                  type="button"
                  onClick={selecionarTodas}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Selecionar todas
                </button>
              ) : (
                <span className="text-[11px] font-medium text-foreground/60">
                  {selecionadas.size} selecionada(s)
                </span>
              )}
            </div>
          </div>
          <ul className="space-y-2">
            {dados.listas.map((l) => {
              const sel = selecionadas.has(l.id);
              return (
                <li
                  key={l.id}
                  className={["relative rounded-xl transition-all", sel ? "ring-1 ring-primary/40" : ""].join(" ")}
                >
                  <div
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelecionada(l.id)}
                      disabled={copiandoBloco !== null}
                      className="grid h-6 w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground transition-colors disabled:opacity-50"
                      title={sel ? 'Desmarcar' : 'Selecionar para copiar em bloco'}
                    >
                      {sel ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
                    </button>
                  </div>
                  <Link
                    to={`/listas/${l.id}`}
                    className="rf-card rf-card-hover block p-4 pl-12 pr-28"
                  >
                    <p className="text-sm font-semibold">{l.titulo}</p>
                    <p className="text-xs text-foreground/50">
                      de {nomeDe(l.donoId)} {l.total > 0 && ` · ${l.total} questões`}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleCopiarLista(l)}
                    disabled={copiandoKey !== null || copiandoBloco !== null}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface disabled:opacity-50"
                  >
                    {copiandoKey === `lista:${l.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    Copiar
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dados && dados.simulados.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <FileText className="h-4 w-4 text-primary" /> Simulados
          </h2>
          <ul className="space-y-2">
            {dados.simulados.map((s) => (
              <li key={s.id} className="relative">
                <Link to={`/simulados/${s.id}`} className="rf-card rf-card-hover block p-4 pr-28">
                  <p className="text-sm font-semibold">{s.titulo}</p>
                  <p className="text-xs text-foreground/50">
                    de {nomeDe(s.donoId)} {s.detalhe && ` · ${s.detalhe}`} {s.total > 0 && ` · ${s.total} questões`}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => handleCopiarSimulado(s)}
                  disabled={copiandoKey !== null}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface disabled:opacity-50"
                >
                  {copiandoKey === `simulado:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  Copiar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingCopy && userId && (
        <EscolherDestinoCopiaModal
          tipo={pendingCopy.tipo}
          nomeItem={pendingCopy.nomeItem}
          userId={userId}
          onConfirm={async (destino) => {
            const pending = pendingCopy;
            setPendingCopy(null);
            await pending.executar(destino);
          }}
          onCancel={() => setPendingCopy(null)}
        />
      )}

      {pendingBloco && userId && (
        <EscolherDestinoCopiaModal
          tipo="lista"
          nomeItem={`${selecionadas.size} lista(s) selecionada(s)`}
          userId={userId}
          onConfirm={(destino) => { void executarCopiaEmBloco(destino); }}
          onCancel={() => setPendingBloco(false)}
        />
      )}

      {selecionadas.size > 0 && !pendingBloco && !copiandoBloco && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-primary/40 bg-surface p-3 shadow-2xl">
          <span className="flex-1 text-sm font-medium">
            {selecionadas.size} selecionada(s)
          </span>
          <button
            type="button"
            onClick={limparSelecao}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={copiarEmBloco}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Copiar selecionadas
          </button>
        </div>
      )}
    </div>
  );
}

// Wrapper de compatibilidade
export default function CompartilhadosPage() {
  return (
    <AppShell breadcrumb="Compartilhado comigo" title="Compartilhado comigo">
      <div className="mx-auto max-w-2xl">
        <CompartilhadosConteudo />
      </div>
    </AppShell>
  );
}