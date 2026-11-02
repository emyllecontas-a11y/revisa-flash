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
  BookOpen, Search, Loader2, Play, Plus, Folder, X, CheckCircle2, Filter
} from "lucide-react";

type TipoFiltro = "" | "multipla_escolha" | "certo_errado";

export function BancoQuestoesTab() {
  const { user } = useAppUser();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todasQuestoes, setTodasQuestoes] = useState<QuestaoBanco[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Filtros em cascata (Matéria -> Assunto -> Subassunto)
  const [fDisciplina, setFDisciplina] = useState("");
  const [fAssunto, setFAssunto] = useState("");
  const [fSubassunto, setFSubassunto] = useState("");

  // Outros filtros
  const [fBanca, setFBanca] = useState("");
  const [fAno, setFAno] = useState("");
  const [fTipo, setFTipo] = useState<TipoFiltro>("");
  const [busca, setBusca] = useState("");

  // Seleção
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        getEstatisticasBanco(user.id),
        getQuestoesDoBanco(user.id),
      ]);
      if (r1.success && r1.data) setStats(r1.data);
      if (r2.success && r2.data) setTodasQuestoes(r2.data);
      else setError(r2.error || "Erro ao carregar questões.");
    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Limpa a seleção quando muda qualquer filtro
  useEffect(() => {
    setSelecionadas(new Set());
  }, [fDisciplina, fAssunto, fSubassunto, fBanca, fAno, fTipo, busca]);

  // ============================================================
  // CONSTRUÇÃO DA ÁRVORE DE FILTROS
  // ============================================================
  const hierarquia = useMemo(() => {
    const tree: Record<string, Record<string, Set<string>>> = {};
    todasQuestoes.forEach((q) => {
      const d = q.disciplina || "Sem matéria";
      const a = q.assunto || "Geral"; // Se a questão não tiver assunto, cai em Geral
      const s = q.subassunto || "Geral";
      
      if (!tree[d]) tree[d] = {};
      if (!tree[d][a]) tree[d][a] = new Set();
      tree[d][a].add(s);
    });
    return tree;
  }, [todasQuestoes]);

  const disciplinasDisponiveis = useMemo(() => Object.keys(hierarquia).sort(), [hierarquia]);
  
  const assuntosDisponiveis = useMemo(() => {
    if (!fDisciplina) return [];
    return Object.keys(hierarquia[fDisciplina] || {}).sort();
  }, [hierarquia, fDisciplina]);

  const subassuntosDisponiveis = useMemo(() => {
    if (!fDisciplina || !fAssunto) return [];
    return Array.from(hierarquia[fDisciplina]?.[fAssunto] || []).sort();
  }, [hierarquia, fDisciplina, fAssunto]);

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
      if (fDisciplina && (q.disciplina || "Sem matéria") !== fDisciplina) return false;
      if (fAssunto && (q.assunto || "Geral") !== fAssunto) return false;
      if (fSubassunto && (q.subassunto || "Geral") !== fSubassunto) return false;

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
  }, [todasQuestoes, fDisciplina, fAssunto, fSubassunto, fBanca, fAno, fTipo, busca]);

  const temFiltroAtivo = !!(fDisciplina || fAssunto || fSubassunto || fBanca || fAno || fTipo || busca);

  const limparFiltros = () => {
    setFDisciplina(""); setFAssunto(""); setFSubassunto("");
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
        <button onClick={load} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Banco de Questões</h2>
          <span className="text-xs text-foreground/45">
            {stats ? `${stats.total} ${stats.total === 1 ? "questão" : "questões"}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => toast.info("Em breve", { description: "O painel de cadernos chega no passo 3.2." })}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-2 transition-colors"
          >
            <Folder className="h-4 w-4" /> Meus Cadernos
          </button>
          {filtradas.length > 0 && (
            <button
              onClick={() => toast.info("Em breve", { description: "O player livre chega no passo 3.4." })}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Play className="h-4 w-4" /> Praticar
            </button>
          )}
        </div>
      </div>

      {/* Painel de Filtros */}
      <div className="mb-4 rf-card p-3 space-y-4">
        {/* Busca + Banca + Ano */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Buscar no enunciado, assunto, cargo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
            />
          </div>
          <Select value={fBanca} onChange={setFBanca} label="Banca" options={bancasDisponiveis} emptyLabel="Todas as bancas" />
          <Select value={fAno} onChange={setFAno} label="Ano" options={anosDisponiveis.map(String)} emptyLabel="Todos os anos" />
        </div>

        {/* Tipo */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45">Tipo:</span>
          <Chip active={fTipo === ""} onClick={() => setFTipo("")}>Todos</Chip>
          <Chip active={fTipo === "multipla_escolha"} onClick={() => setFTipo("multipla_escolha")}>Múltipla escolha</Chip>
          <Chip active={fTipo === "certo_errado"} onClick={() => setFTipo("certo_errado")}>Certo / Errado</Chip>
        </div>

        <hr className="border-border/60" />

        {/* Filtros em Cascata (Matéria -> Assunto -> Subassunto) */}
        <div className="space-y-3">
          {/* Nível 1: Matéria */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-16">Matéria:</span>
            <Chip active={fDisciplina === ""} onClick={() => { setFDisciplina(""); setFAssunto(""); setFSubassunto(""); }}>
              Todas
            </Chip>
            {disciplinasDisponiveis.map(d => (
              <Chip 
                key={d} 
                active={fDisciplina === d} 
                onClick={() => { setFDisciplina(d); setFAssunto(""); setFSubassunto(""); }}
              >
                {d}
              </Chip>
            ))}
          </div>

          {/* Nível 2: Assunto (só aparece se escolheu a matéria) */}
          {fDisciplina && assuntosDisponiveis.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-4 border-l-2 border-primary/20">
              <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-16">Assunto:</span>
              <Chip active={fAssunto === ""} onClick={() => { setFAssunto(""); setFSubassunto(""); }}>
                Todos (Matéria inteira)
              </Chip>
              {assuntosDisponiveis.map(a => (
                <Chip 
                  key={a} 
                  active={fAssunto === a} 
                  onClick={() => { setFAssunto(a); setFSubassunto(""); }}
                >
                  {a}
                </Chip>
              ))}
            </div>
          )}

          {/* Nível 3: Subassunto (só aparece se escolheu o assunto) */}
          {fDisciplina && fAssunto && subassuntosDisponiveis.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-8 border-l-2 border-primary/20">
              <span className="mr-1 text-[11px] uppercase tracking-wider text-foreground/45 w-16">Subassunto:</span>
              <Chip active={fSubassunto === ""} onClick={() => setFSubassunto("")}>
                Todos (Assunto inteiro)
              </Chip>
              {subassuntosDisponiveis.map(s => (
                <Chip 
                  key={s} 
                  active={fSubassunto === s} 
                  onClick={() => setFSubassunto(s)}
                >
                  {s}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {/* Contador + Limpar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-foreground/55 font-medium">
            {filtradas.length} de {todasQuestoes.length} questões encontradas
          </span>
          <div className="flex items-center gap-3">
            {filtradas.length > 0 && (
              <button onClick={selecionarTodasFiltradas} className="text-primary hover:underline">
                Selecionar todas
              </button>
            )}
            {temFiltroAtivo && (
              <button onClick={limparFiltros} className="inline-flex items-center gap-1 text-foreground/55 hover:text-foreground">
                <X className="h-3 w-3" /> Limpar todos os filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ações em massa */}
      {selecionadas.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">
            {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => toast.info("Em breve", { description: "Criar caderno chega no passo 3.3." })}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Criar caderno
          </button>
          <button onClick={() => setSelecionadas(new Set())} className="text-xs text-foreground/55 hover:text-foreground">
            Limpar seleção
          </button>
        </div>
      )}

      {/* Lista */}
      {todasQuestoes.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-12 text-center">
          <BookOpen className="h-10 w-10 text-foreground/20" />
          <h3 className="mt-3 font-display text-sm font-semibold">Nenhuma questão no banco</h3>
          <p className="mt-1 max-w-xs text-xs text-foreground/45">
            Importe questões pelo teste do parser para começar.
          </p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-surface/25 p-8 text-center">
          <p className="text-xs text-foreground/45">Nenhuma questão encontrada com esses filtros.</p>
          {temFiltroAtivo && (
            <button onClick={limparFiltros} className="mt-3 text-xs text-primary hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="rf-card p-2 sm:p-3">
          <ul className="divide-y divide-border">
            {filtradas.map((q) => {
              const sel = selecionadas.has(q.id);
              return (
                <li key={q.id}>
                  <div className="flex gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleSelecionada(q.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge>{q.banca}</Badge>
                        {q.ano && <Badge>{q.ano}</Badge>}
                        <Badge className="bg-primary/10 text-primary font-semibold">{q.disciplina}</Badge>
                        {q.assunto && <BadgeSoft>{q.assunto}</BadgeSoft>}
                        {q.subassunto && <span className="text-[10px] text-foreground/40">› {q.subassunto}</span>}
                        <Badge
                          className={
                            q.tipo_questao === "certo_errado"
                              ? "bg-warning/15 text-warning"
                              : "bg-primary/15 text-primary"
                          }
                        >
                          {q.tipo_questao === "certo_errado" ? "C/E" : "Múltipla"}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-sm text-foreground/85">
                        {q.enunciado}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Componentes auxiliares
// ============================================================

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-surface text-foreground/65 hover:bg-surface-2",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Select({
  value, onChange, label, options, emptyLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
  emptyLabel: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-foreground/45">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Badge({
  children, className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        className || "bg-muted text-foreground/65",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function BadgeSoft({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">
      {children}
    </span>
  );
}