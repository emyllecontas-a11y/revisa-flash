// src/components/BancoQuestoesTab.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import {
  getQuestoesDoBanco,
  getEstatisticasBanco,
  limparDuplicatasLocais,
  type QuestaoBanco,
} from "@/services/bancoQuestoesService";
import {
  getPastasCaderno,
  getCadernos,
  criarPastaCaderno,
  criarCaderno,
  atualizarCaderno,
  excluirCaderno,
  atualizarPasta,
  excluirPasta,
  type PastaCaderno,
  type Caderno
} from "@/services/cadernoService";
import {
  BookOpen, Search, Loader2, Play, Plus, Folder, X, CheckCircle2,
  ArrowLeft, FolderOpen, ChevronRight, FileText, Pencil, Trash2
} from "lucide-react";
import { PlayerLivreModal } from "@/components/PlayerLivreModal";
import { CadernoDetalhesModal } from "@/components/CadernoDetalhesModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { getTaxonomia } from "@/services/taxonomiaService";

type TipoFiltro = "" | "multipla_escolha" | "certo_errado";
type ViewMode = "questoes" | "cadernos";

export function BancoQuestoesTab() {
  const { user } = useAppUser();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [viewMode, setViewMode] = useState<ViewMode>("questoes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [todasQuestoes, setTodasQuestoes] = useState<QuestaoBanco[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  const [pastas, setPastas] = useState<PastaCaderno[]>([]);
  const [cadernos, setCadernos] = useState<Caderno[]>([]);
  const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);

  const [modalNovaPasta, setModalNovaPasta] = useState(false);
  const [modalEditarPasta, setModalEditarPasta] = useState<PastaCaderno | null>(null);
  const [modalNovoCaderno, setModalNovoCaderno] = useState(false);
  const [modalEditarCaderno, setModalEditarCaderno] = useState<Caderno | null>(null);
  const [modalPraticar, setModalPraticar] = useState(false);
  const [cadernoAberto, setCadernoAberto] = useState<Caderno | null>(null);

  const [fDisciplina, setFDisciplina] = useState("");
  const [fMateria, setFMateria] = useState("");
  const [fAssunto, setFAssunto] = useState("");
  const [fBanca, setFBanca] = useState("");
  const [fAno, setFAno] = useState("");
  const [fTipo, setFTipo] = useState<TipoFiltro>("");
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      await limparDuplicatasLocais(user.id);
      const [r1, r2, r3, r4] = await Promise.all([
        getEstatisticasBanco(user.id),
        getQuestoesDoBanco(user.id),
        getPastasCaderno(user.id),
        getCadernos(user.id),
      ]);
      if (r1.success && r1.data) setStats(r1.data);
      if (r2.success && r2.data) setTodasQuestoes(r2.data);
      if (r3.success && r3.data) setPastas(r3.data);
      if (r4.success && r4.data) setCadernos(r4.data);
    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelecionadas(new Set()); }, [fDisciplina, fMateria, fAssunto, fBanca, fAno, fTipo, busca]);

  const handleExcluirCaderno = async (e: React.MouseEvent, c: Caderno) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "Excluir caderno?", description: `O caderno "${c.nome}" será apagado.`, confirmText: "Excluir", destructive: true });
    if (!ok || !user?.id) return;
    const res = await excluirCaderno(user.id, c.id);
    if (res.success) { load(); toast.success("Caderno excluído"); } else toast.error("Erro", { description: res.error });
  };

  const handleExcluirPasta = async (e: React.MouseEvent, p: PastaCaderno) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: "Excluir pasta?", description: `A pasta "${p.name}" será apagada.`, confirmText: "Excluir", destructive: true });
    if (!ok || !user?.id) return;
    const res = await excluirPasta(user.id, p.id);
    if (res.success) { if (pastaSelecionada === p.id) setPastaSelecionada(null); load(); toast.success("Pasta excluída"); } else toast.error("Erro", { description: res.error });
  };

  // --- MONTAGEM DA HIERARQUIA (CÓDIGO + BANCO) ---
  const hierarquia = useMemo(() => {
    const tree: Record<string, Record<string, Set<string>>> = {};
    
    // 1. Puxa as matérias direto do código (TAXONOMIA_BASE)
    const tax = getTaxonomia();
    tax.forEach(t => {
      if (!tree[t.disciplina]) tree[t.disciplina] = {};
      t.materias.forEach(m => {
        if (!tree[t.disciplina][m.nome]) tree[t.disciplina][m.nome] = new Set();
        m.topicos.forEach(top => tree[t.disciplina][m.nome].add(top.nome));
      });
    });

    // 2. Mescla com as questões que estão no banco
    todasQuestoes.forEach((q) => {
      const disc = q.disciplina || "Sem disciplina";
      const materia = q.assunto || "Geral"; 
      const assunto = q.subassunto || "Geral";
      if (!tree[disc]) tree[disc] = {};
      if (!tree[disc][materia]) tree[disc][materia] = new Set();
      tree[disc][materia].add(assunto);
    });
    
    return tree;
  }, [todasQuestoes]);

  const disciplinasDisponiveis = useMemo(() => Object.keys(hierarquia).sort(), [hierarquia]);
  const materiasDisponiveis = useMemo(() => fDisciplina ? Object.keys(hierarquia[fDisciplina] || {}).sort() : [], [hierarquia, fDisciplina]);
  const assuntosDisponiveis = useMemo(() => (fDisciplina && fMateria) ? Array.from(hierarquia[fDisciplina]?.[fMateria] || []).sort() : [], [hierarquia, fDisciplina, fMateria]);

  const bancasDisponiveis = useMemo(() => { const set = new Set<string>(); todasQuestoes.forEach(q => { if (q.banca) set.add(q.banca); }); return Array.from(set).sort(); }, [todasQuestoes]);
  const anosDisponiveis = useMemo(() => { const set = new Set<number>(); todasQuestoes.forEach(q => { if (q.ano) set.add(q.ano); }); return Array.from(set).sort((a, b) => b - a); }, [todasQuestoes]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todasQuestoes.filter((q) => {
      if (fDisciplina && (q.disciplina || "Sem disciplina") !== fDisciplina) return false;
      if (fMateria && (q.assunto || "Geral") !== fMateria) return false;
      if (fAssunto && (q.subassunto || "Geral") !== fAssunto) return false;
      if (fBanca && q.banca !== fBanca) return false;
      if (fAno && String(q.ano ?? "") !== fAno) return false;
      if (fTipo && q.tipo_questao !== fTipo) return false;
      if (termo) {
        const hay = [q.enunciado, q.assunto, q.subassunto, q.cargo, q.concurso].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(termo)) return false;
      }
      return true;
    });
  }, [todasQuestoes, fDisciplina, fMateria, fAssunto, fBanca, fAno, fTipo, busca]);

  const temFiltroAtivo = !!(fDisciplina || fMateria || fAssunto || fBanca || fAno || fTipo || busca);
  const limparFiltros = () => { setFDisciplina(""); setFMateria(""); setFAssunto(""); setFBanca(""); setFAno(""); setFTipo(""); setBusca(""); };
  const selecionarTodasFiltradas = () => setSelecionadas(new Set(filtradas.map((q) => q.id)));
  const toggleSelecionada = (id: string) => { setSelecionadas(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const cadernosFiltrados = useMemo(() => { if (!pastaSelecionada) return cadernos; if (pastaSelecionada === "sem-pasta") return cadernos.filter(c => !c.pasta_id); return cadernos.filter(c => c.pasta_id === pastaSelecionada); }, [cadernos, pastaSelecionada]);

  if (loading) return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="rf-card p-6 text-center"><p className="text-accent">{error}</p><button onClick={load} className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Tentar novamente</button></div>;

  return (
    <>
      {viewMode === "cadernos" ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode("questoes")} className="mr-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2"><ArrowLeft className="h-3.5 w-3.5" /> Voltar</button>
              <Folder className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-bold">Meus Cadernos</h2>
            </div>
            <button onClick={() => setModalNovoCaderno(true)} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" /> Novo Caderno</button>
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Chip active={pastaSelecionada === null} onClick={() => setPastaSelecionada(null)}>Todas as pastas</Chip>
            <Chip active={pastaSelecionada === "sem-pasta"} onClick={() => setPastaSelecionada("sem-pasta")}>Sem pasta</Chip>
            {pastas.map(p => (
              <div key={p.id} className="relative group">
                <Chip active={pastaSelecionada === p.id} onClick={() => setPastaSelecionada(p.id)}><Folder className="h-3 w-3 mr-1" /> {p.name}</Chip>
                <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-surface border border-border rounded-full p-0.5 shadow-sm">
                  <button onClick={(e) => { e.stopPropagation(); setModalEditarPasta(p); }} className="p-1 hover:text-primary rounded-full" title="Renomear"><Pencil className="h-3 w-3" /></button>
                  <button onClick={(e) => handleExcluirPasta(e, p)} className="p-1 hover:text-accent rounded-full" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
            <button onClick={() => setModalNovaPasta(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/60 hover:border-primary hover:text-primary"><Plus className="h-3 w-3" /> Nova pasta</button>
          </div>
          {cadernosFiltrados.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
              <FolderOpen className="h-10 w-10 text-foreground/20" /><h3 className="mt-3 font-display text-sm font-semibold">Nenhum caderno</h3>
              <p className="mt-1 max-w-xs text-xs text-foreground/45">Selecione questões na aba anterior e crie um caderno.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cadernosFiltrados.map(c => {
                const pasta = pastas.find(p => p.id === c.pasta_id);
                return (
                  <div key={c.id} className="rf-card p-4 flex flex-col hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => setCadernoAberto(c)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                        <h3 className="font-display text-sm font-bold line-clamp-1">{c.nome}</h3>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setModalEditarCaderno(c); }} className="p-1 text-foreground/40 hover:text-primary rounded-full"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={(e) => handleExcluirCaderno(e, c)} className="p-1 text-foreground/40 hover:text-accent rounded-full"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    {c.descricao && <p className="mt-2 text-xs text-foreground/50 line-clamp-2">{c.descricao}</p>}
                    <div className="mt-auto pt-4 flex items-center justify-between text-xs text-foreground/45">
                      <span className="font-medium">{c.questoes_count || 0} questões</span>
                      {pasta && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Folder className="h-3 w-3" /> {pasta.name}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /><h2 className="font-display text-lg font-bold">Banco de Questões</h2>
              <span className="text-xs text-foreground/45">{stats ? `${stats.total} questões` : ""}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setViewMode("cadernos")} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"><Folder className="h-4 w-4" /> Meus Cadernos</button>
              {filtradas.length > 0 && (<button onClick={() => setModalPraticar(true)} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"><Play className="h-4 w-4" /> Praticar</button>)}
            </div>
          </div>
          <div className="mb-4 rf-card p-3 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative lg:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                <input type="text" placeholder="Buscar no enunciado, matéria, cargo…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40" />
              </div>
              <Select value={fBanca} onChange={setFBanca} label="Banca" options={bancasDisponiveis} emptyLabel="Todas as bancas" />
              <Select value={fAno} onChange={setFAno} label="Ano" options={anosDisponiveis.map(String)} emptyLabel="Todos os anos" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45">Tipo:</span>
              <Chip active={fTipo === ""} onClick={() => setFTipo("")}>Todos</Chip>
              <Chip active={fTipo === "multipla_escolha"} onClick={() => setFTipo("multipla_escolha")}>Múltipla escolha</Chip>
              <Chip active={fTipo === "certo_errado"} onClick={() => setFTipo("certo_errado")}>Certo / Errado</Chip>
            </div>
            <hr className="border-border/60" />
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-20">Disciplina:</span>
                <Chip active={fDisciplina === ""} onClick={() => { setFDisciplina(""); setFMateria(""); setFAssunto(""); }}>Todas</Chip>
                {disciplinasDisponiveis.map(d => (<Chip key={d} active={fDisciplina === d} onClick={() => { setFDisciplina(d); setFMateria(""); setFAssunto(""); }}>{d}</Chip>))}
              </div>
              {fDisciplina && materiasDisponiveis.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pl-4 border-l-2 border-primary/20">
                  <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-20">Matéria:</span>
                  <Chip active={fMateria === ""} onClick={() => { setFMateria(""); setFAssunto(""); }}>Todas</Chip>
                  {materiasDisponiveis.map(m => (<Chip key={m} active={fMateria === m} onClick={() => { setFMateria(m); setFAssunto(""); }}>{m}</Chip>))}
                </div>
              )}
              {fDisciplina && fMateria && assuntosDisponiveis.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pl-8 border-l-2 border-primary/20">
                  <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-20">Assunto:</span>
                  <Chip active={fAssunto === ""} onClick={() => setFAssunto("")}>Todos</Chip>
                  {assuntosDisponiveis.map(a => (<Chip key={a} active={fAssunto === a} onClick={() => setFAssunto(a)}>{a}</Chip>))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-foreground/55 font-medium">{filtradas.length} de {todasQuestoes.length} questões encontradas</span>
              <div className="flex items-center gap-3">
                {filtradas.length > 0 && (<button onClick={selecionarTodasFiltradas} className="text-primary hover:underline">Selecionar todas</button>)}
                {temFiltroAtivo && (<button onClick={limparFiltros} className="inline-flex items-center gap-1 text-foreground/55 hover:text-foreground"><X className="h-3 w-3" /> Limpar</button>)}
              </div>
            </div>
          </div>
          {selecionadas.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">{selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}</span>
              <button onClick={() => setModalNovoCaderno(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"><Plus className="h-3.5 w-3.5" /> Criar caderno</button>
              <button onClick={() => setSelecionadas(new Set())} className="text-xs text-foreground/55 hover:text-foreground">Limpar seleção</button>
            </div>
          )}
          {todasQuestoes.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
              <BookOpen className="h-10 w-10 text-foreground/20" /><h3 className="mt-3 font-display text-sm font-semibold">Nenhuma questão no banco</h3>
              <p className="mt-1 max-w-xs text-xs text-foreground/45">Importe questões pelo teste do parser ou adicione manualmente.</p>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-8 text-center">
              <p className="text-xs text-foreground/45">Nenhuma questão encontrada com esses filtros.</p>
              {temFiltroAtivo && (<button onClick={limparFiltros} className="mt-3 text-xs text-primary hover:underline">Limpar filtros</button>)}
            </div>
          ) : (
            <div className="rf-card p-2 sm:p-3">
              <ul className="divide-y divide-border">
                {filtradas.map((q) => (
                  <li key={q.id}>
                    <div className="flex gap-3 py-3">
                      <input type="checkbox" checked={selecionadas.has(q.id)} onChange={() => toggleSelecionada(q.id)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <Badge>{q.banca}</Badge>
                          {q.ano && <Badge>{q.ano}</Badge>}
                          <Badge className="bg-primary/10 text-primary font-semibold">{q.disciplina}</Badge>
                          {q.assunto && <BadgeSoft>{q.assunto}</BadgeSoft>}
                          {q.subassunto && q.subassunto !== "Geral" && (<span className="text-[10px] text-foreground/40">› {q.subassunto}</span>)}
                          <Badge className={q.tipo_questao === "certo_errado" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}>{q.tipo_questao === "certo_errado" ? "C/E" : "Múltipla"}</Badge>
                        </div>
                        <p className="line-clamp-2 text-sm text-foreground/85">{q.enunciado}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {modalNovaPasta && user?.id && (<PastaModal userId={user.id} onClose={() => setModalNovaPasta(false)} onSuccess={() => { setModalNovaPasta(false); load(); }} />)}
      {modalEditarPasta && user?.id && (<PastaModal userId={user.id} pasta={modalEditarPasta} onClose={() => setModalEditarPasta(null)} onSuccess={() => { setModalEditarPasta(null); load(); }} />)}
      {modalNovoCaderno && user?.id && (<CadernoModal userId={user.id} pastas={pastas} questoesIds={Array.from(selecionadas)} onClose={() => setModalNovoCaderno(false)} onSuccess={() => { setModalNovoCaderno(false); setSelecionadas(new Set()); load(); toast.success("Caderno criado!"); }} />)}
      {modalEditarCaderno && user?.id && (<CadernoModal userId={user.id} pastas={pastas} caderno={modalEditarCaderno} onClose={() => setModalEditarCaderno(null)} onSuccess={() => { setModalEditarCaderno(null); load(); toast.success("Caderno atualizado!"); }} />)}
      {modalPraticar && user?.id && (<PlayerLivreModal userId={user.id} questoes={filtradas} onClose={() => { setModalPraticar(false); load(); }} />)}
      {cadernoAberto && user?.id && (<CadernoDetalhesModal caderno={cadernoAberto} userId={user.id} onClose={() => setCadernoAberto(null)} onUpdate={load} />)}
    </>
  );
}

function PastaModal({ userId, pasta, onClose, onSuccess }: { userId: string; pasta?: PastaCaderno; onClose: () => void; onSuccess: () => void }) {
  const [nome, setNome] = useState(pasta?.name || "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSalvar = async () => {
    if (!nome.trim()) return;
    setSalvando(true); setError(null);
    const res = pasta ? await atualizarPasta(userId, pasta.id, nome) : await criarPastaCaderno(userId, nome);
    setSalvando(false);
    if (res.success) onSuccess(); else setError(res.error || "Erro ao salvar");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold text-foreground">{pasta ? "Renomear Pasta" : "Nova Pasta"}</h3><button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button></div>
        <label className="text-sm font-medium text-foreground/70">Nome da pasta *</label>
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} disabled={salvando} autoFocus onKeyDown={(e) => e.key === "Enter" && handleSalvar()} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1" />
        {error && <div className="mt-3 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">{error}</div>}
        <div className="mt-5 flex gap-2"><button onClick={onClose} disabled={salvando} className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium hover:bg-surface-2">Cancelar</button><button onClick={handleSalvar} disabled={salvando || !nome.trim()} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Salvar"}</button></div>
      </div>
    </div>
  );
}

function CadernoModal({ userId, pastas, questoesIds, caderno, onClose, onSuccess }: { userId: string; pastas: PastaCaderno[]; questoesIds?: string[]; caderno?: Caderno; onClose: () => void; onSuccess: () => void }) {
  const [nome, setNome] = useState(caderno?.nome || "");
  const [pastaId, setPastaId] = useState<string>(caderno?.pasta_id || "sem-pasta");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSalvar = async () => {
    if (!nome.trim()) return;
    setSalvando(true); setError(null);
    let res;
    if (caderno) { res = await atualizarCaderno(userId, caderno.id, { nome, pasta_id: pastaId }); } else {
      if (!questoesIds || questoesIds.length === 0) { setError("Nenhuma questão selecionada."); setSalvando(false); return; }
      res = await criarCaderno(userId, nome, pastaId, questoesIds);
    }
    setSalvando(false);
    if (res.success) onSuccess(); else setError(res.error || "Erro ao salvar");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold text-foreground">{caderno ? "Editar Caderno" : "Novo Caderno"}</h3><button onClick={onClose} className="text-foreground/50 hover:text-foreground"><X className="h-5 w-5" /></button></div>
        <div className="space-y-4">
          <div><label className="text-sm font-medium text-foreground/70">Nome do caderno *</label><input type="text" value={nome} onChange={(e) => setNome(e.target.value)} disabled={salvando} autoFocus className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1" /></div>
          <div><label className="text-sm font-medium text-foreground/70">Pasta (opcional)</label><select value={pastaId} onChange={(e) => setPastaId(e.target.value)} disabled={salvando} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary mt-1"><option value="sem-pasta">Sem pasta</option>{pastas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          {!caderno && questoesIds && (<div className="rounded-lg bg-primary/5 p-3 text-xs text-primary">{questoesIds.length} questões selecionadas.</div>)}
          {error && <div className="rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">{error}</div>}
        </div>
        <div className="mt-5 flex gap-2"><button onClick={onClose} disabled={salvando} className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-medium hover:bg-surface-2">Cancelar</button><button onClick={handleSalvar} disabled={salvando || !nome.trim()} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Salvar"}</button></div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={["inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-foreground/65 hover:bg-surface-2"].join(" ")}>{children}</button>; }
function Select({ value, onChange, label, options, emptyLabel }: { value: string; onChange: (v: string) => void; label: string; options: string[]; emptyLabel: string; }) { return <label className="block"><span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-foreground/45">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary"><option value="">{emptyLabel}</option>{options.map((o) => (<option key={o} value={o}>{o}</option>))}</select></label>; }
function Badge({ children, className }: { children: React.ReactNode; className?: string }) { return <span className={["inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium", className || "bg-muted text-foreground/65"].join(" ")}>{children}</span>; }
function BadgeSoft({ children }: { children: React.ReactNode }) { return <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">{children}</span>; }