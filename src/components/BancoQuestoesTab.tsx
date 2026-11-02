// src/components/BancoQuestoesTab.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import {
  getQuestoesDoBanco,
  getEstatisticasBanco,
  type QuestaoBanco,
} from "@/services/bancoQuestoesService";
import {
  getPastasCaderno,
  getCadernos,
  type PastaCaderno,
  type Caderno
} from "@/services/cadernoService";
import {
  BookOpen, Search, Loader2, Play, Plus, Folder, X, CheckCircle2,
  ArrowLeft, FolderOpen, ChevronRight, FileText
} from "lucide-react";

type TipoFiltro = "" | "multipla_escolha" | "certo_errado";
type ViewMode = "questoes" | "cadernos";

export function BancoQuestoesTab() {
  const { user } = useAppUser();
  const toast = useToast();

  // Controle de tela
  const [viewMode, setViewMode] = useState<ViewMode>("questoes");

  // Dados
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todasQuestoes, setTodasQuestoes] = useState<QuestaoBanco[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  // Dados de Cadernos
  const [pastas, setPastas] = useState<PastaCaderno[]>([]);
  const [cadernos, setCadernos] = useState<Caderno[]>([]);
  const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);

  // Filtros de Questões (Disciplina -> Matéria -> Assunto)
  const [fDisciplina, setFDisciplina] = useState("");
  const [fMateria, setFMateria] = useState(""); // O que o banco chama de "assunto"
  const [fAssunto, setFAssunto] = useState(""); // O que o banco chama de "subassunto"

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
      const [r1, r2, r3, r4] = await Promise.all([
        getEstatisticasBanco(user.id),
        getQuestoesDoBanco(user.id),
        getPastasCaderno(user.id),
        getCadernos(user.id),
      ]);
      if (r1.success && r1.data) setStats(r1.data);
      if (r2.success && r2.data) setTodasQuestoes(r2.data);
      else setError(r2.error || "Erro ao carregar questões.");
      
      if (r3.success && r3.data) setPastas(r3.data);
      if (r4.success && r4.data) setCadernos(r4.data);

    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setSelecionadas(new Set());
  }, [fDisciplina, fMateria, fAssunto, fBanca, fAno, fTipo, busca]);

  // ============================================================
  // ÁRVORE DE FILTROS (Disciplina -> Matéria -> Assunto)
  // ============================================================
  const hierarquia = useMemo(() => {
    const tree: Record<string, Record<string, Set<string>>> = {};
    todasQuestoes.forEach((q) => {
      // Aqui fazemos a ponte: o banco chama de "assunto" e "subassunto", 
      // mas a tela entende como "matéria" e "assunto".
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
  
  const materiasDisponiveis = useMemo(() => {
    if (!fDisciplina) return [];
    return Object.keys(hierarquia[fDisciplina] || {}).sort();
  }, [hierarquia, fDisciplina]);

  const assuntosDisponiveis = useMemo(() => {
    if (!fDisciplina || !fMateria) return [];
    return Array.from(hierarquia[fDisciplina]?.[fMateria] || []).sort();
  }, [hierarquia, fDisciplina, fMateria]);

  const bancasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    todasQuestoes.forEach((q) => { if (q.banca) set.add(q.banca); });
    return Array.from(set).sort();
  }, [todasQuestoes]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    todasQuestoes.forEach((q) => { if (q.ano) set.add(q.ano); });
    return Array.from(set).sort((a, b) => b - a);
  }, [todasQuestoes]);

  // ============================================================
  // FILTRAGEM
  // ============================================================
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todasQuestoes.filter((q) => {
      // Filtros em cascata
      if (fDisciplina && (q.disciplina || "Sem disciplina") !== fDisciplina) return false;
      if (fMateria && (q.assunto || "Geral") !== fMateria) return false;
      if (fAssunto && (q.subassunto || "Geral") !== fAssunto) return false;

      // Filtros gerais
      if (fBanca && q.banca !== fBanca) return false;
      if (fAno && String(q.ano ?? "") !== fAno) return false;
      if (fTipo && q.tipo_questao !== fTipo) return false;
      
      if (termo) {
        const hay = [q.enunciado, q.assunto, q.subassunto, q.cargo, q.concurso]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(termo)) return false;
      }
      return true;
    });
  }, [todasQuestoes, fDisciplina, fMateria, fAssunto, fBanca, fAno, fTipo, busca]);

  const temFiltroAtivo = !!(fDisciplina || fMateria || fAssunto || fBanca || fAno || fTipo || busca);

  const limparFiltros = () => {
    setFDisciplina(""); setFMateria(""); setFAssunto("");
    setFBanca(""); setFAno(""); setFTipo(""); setBusca("");
  };

  const selecionarTodasFiltradas = () => {
    setSelecionadas(new Set(filtradas.map((q) => q.id)));
  };

  const toggleSelecionada = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // --- LÓGICA DE CADERNOS ---
  const cadernosFiltrados = useMemo(() => {
    if (!pastaSelecionada) return cadernos;
    if (pastaSelecionada === "sem-pasta") return cadernos.filter(c => !c.pasta_id);
    return cadernos.filter(c => c.pasta_id === pastaSelecionada);
  }, [cadernos, pastaSelecionada]);

  if (loading) return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="rf-card p-6 text-center"><p className="text-accent">{error}</p><button onClick={load} className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Tentar novamente</button></div>;

  // ============================================================
  // TELA DE CADERNOS
  // ============================================================
  if (viewMode === "cadernos") {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode("questoes")} className="mr-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </button>
            <Folder className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Meus Cadernos</h2>
          </div>
          <button onClick={() => toast.info("Em breve", { description: "Criar cadernos e pastas chega no passo 3.3." })} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo Caderno
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Chip active={pastaSelecionada === null} onClick={() => setPastaSelecionada(null)}>Todas as pastas</Chip>
          <Chip active={pastaSelecionada === "sem-pasta"} onClick={() => setPastaSelecionada("sem-pasta")}>Sem pasta</Chip>
          {pastas.map(p => (
            <Chip key={p.id} active={pastaSelecionada === p.id} onClick={() => setPastaSelecionada(p.id)}>
              <Folder className="h-3 w-3 mr-1" /> {p.name}
            </Chip>
          ))}
          <button onClick={() => toast.info("Em breve", { description: "Criar pastas chega no passo 3.3." })} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/60 hover:border-primary hover:text-primary">
            <Plus className="h-3 w-3" /> Nova pasta
          </button>
        </div>

        {cadernosFiltrados.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
            <FolderOpen className="h-10 w-10 text-foreground/20" />
            <h3 className="mt-3 font-display text-sm font-semibold">Nenhum caderno {pastaSelecionada && pastaSelecionada !== 'sem-pasta' ? "nesta pasta" : "ainda"}</h3>
            <p className="mt-1 max-w-xs text-xs text-foreground/45">
              Selecione questões na aba anterior e crie o seu primeiro caderno.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cadernosFiltrados.map(c => {
              const pasta = pastas.find(p => p.id === c.pasta_id);
              return (
                <div key={c.id} className="rf-card p-4 flex flex-col hover:border-primary/50 transition-colors cursor-pointer" onClick={() => toast.info("Em breve", { description: "O player do caderno chega no passo 3.4." })}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h3 className="font-display text-sm font-bold line-clamp-1">{c.nome}</h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-foreground/30 mt-1" />
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
    );
  }

  // ============================================================
  // TELA DE QUESTÕES (Padrão)
  // ============================================================
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Banco de Questões</h2>
          <span className="text-xs text-foreground/45">
            {stats ? `${stats.total} ${stats.total === 1 ? "questão" : "questões"}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setViewMode("cadernos")} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors">
            <Folder className="h-4 w-4" /> Meus Cadernos
          </button>
          {filtradas.length > 0 && (
            <button onClick={() => toast.info("Em breve", { description: "O player livre chega no passo 3.4." })} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
              <Play className="h-4 w-4" /> Praticar
            </button>
          )}
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

        {/* Filtros em Cascata */}
        <div className="space-y-3">
          {/* Nível 1: Disciplina */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-20">Disciplina:</span>
            <Chip active={fDisciplina === ""} onClick={() => { setFDisciplina(""); setFMateria(""); setFAssunto(""); }}>
              Todas
            </Chip>
            {disciplinasDisponiveis.map(d => (
              <Chip 
                key={d} 
                active={fDisciplina === d} 
                onClick={() => { setFDisciplina(d); setFMateria(""); setFAssunto(""); }}
              >
                {d}
              </Chip>
            ))}
          </div>

          {/* Nível 2: Matéria */}
          {fDisciplina && materiasDisponiveis.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-4 border-l-2 border-primary/20">
              <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-20">Matéria:</span>
              <Chip active={fMateria === ""} onClick={() => { setFMateria(""); setFAssunto(""); }}>
                Todas (Disciplina inteira)
              </Chip>
              {materiasDisponiveis.map(m => (
                <Chip 
                  key={m} 
                  active={fMateria === m} 
                  onClick={() => { setFMateria(m); setFAssunto(""); }}
                >
                  {m}
                </Chip>
              ))}
            </div>
          )}

          {/* Nível 3: Assunto / Tópico */}
          {fDisciplina && fMateria && assuntosDisponiveis.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-8 border-l-2 border-primary/20">
              <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-20">Assunto:</span>
              <Chip active={fAssunto === ""} onClick={() => setFAssunto("")}>
                Todos (Matéria inteira)
              </Chip>
              {assuntosDisponiveis.map(a => (
                <Chip 
                  key={a} 
                  active={fAssunto === a} 
                  onClick={() => setFAssunto(a)}
                >
                  {a}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-foreground/55 font-medium">{filtradas.length} de {todasQuestoes.length} questões encontradas</span>
          <div className="flex items-center gap-3">
            {filtradas.length > 0 && (<button onClick={selecionarTodasFiltradas} className="text-primary hover:underline">Selecionar todas</button>)}
            {temFiltroAtivo && (<button onClick={limparFiltros} className="inline-flex items-center gap-1 text-foreground/55 hover:text-foreground"><X className="h-3 w-3" /> Limpar todos os filtros</button>)}
          </div>
        </div>
      </div>

      {selecionadas.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">{selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}</span>
          <button onClick={() => toast.info("Em breve", { description: "Criar caderno chega no passo 3.3." })} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Criar caderno
          </button>
          <button onClick={() => setSelecionadas(new Set())} className="text-xs text-foreground/55 hover:text-foreground">Limpar seleção</button>
        </div>
      )}

      {todasQuestoes.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
          <BookOpen className="h-10 w-10 text-foreground/20" />
          <h3 className="mt-3 font-display text-sm font-semibold">Nenhuma questão no banco</h3>
          <p className="mt-1 max-w-xs text-xs text-foreground/45">Importe questões pelo teste do parser para começar.</p>
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
                      <Badge className={q.tipo_questao === "certo_errado" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}>
                        {q.tipo_questao === "certo_errado" ? "C/E" : "Múltipla"}
                      </Badge>
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
  );
}

// Auxiliares
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={["inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-foreground/65 hover:bg-surface-2"].join(" ")}>
      {children}
    </button>
  );
}
function Select({ value, onChange, label, options, emptyLabel }: { value: string; onChange: (v: string) => void; label: string; options: string[]; emptyLabel: string; }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-foreground/45">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary">
        <option value="">{emptyLabel}</option>
        {options.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    </label>
  );
}
function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={["inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium", className || "bg-muted text-foreground/65"].join(" ")}>{children}</span>;
}
function BadgeSoft({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">{children}</span>;
}