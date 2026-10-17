// src/components/PlanoDiaCard.tsx
import { useState, useMemo } from "react";
import { CheckCircle2, Circle, CalendarCheck, Settings, Archive, X, ChevronRight, CalendarClock } from "lucide-react";
import { useAppUser } from "@/contexts/UserContext";
import { usePlano } from "@/hooks/usePlano";
import { resolverDia, chaveBloco, hojeISO, obterDataDoBloco, type Plano, type PlanoBloco } from "@/services/planoService";

const COR: Record<string, string> = {
  P: "#FE7802", M: "#C9CED6", RL: "#C9CED6", I: "#FFA64D",
  OD: "#F5B83D", SUS: "#E5432D", REV: "#E0A5C0",
};
const ROTULO: Record<string, string> = {
  P: "Português", M: "Matemática", RL: "Raciocínio Lógico", I: "Informática",
  OD: "Odontologia", SUS: "SUS / EBSERH", REV: "Revisão",
};

function ItemBloco({ bloco, feito, onClick, dataAtrasada }: { bloco: PlanoBloco; feito: boolean; onClick: () => void; dataAtrasada?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-3 text-left transition-colors hover:bg-background/60">
      {feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-foreground/30" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: COR[bloco.k] || "#C9CED6" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR[bloco.k] || "#C9CED6" }} />
          {ROTULO[bloco.k] || bloco.k}
          {dataAtrasada && <span className="ml-2 text-[10px] text-destructive/80 bg-destructive/10 px-1.5 py-0.5 rounded">Atrasado: {dataAtrasada.split('-').reverse().slice(0,2).join('/')}</span>}
        </div>
        <div className={`text-sm font-medium ${feito ? "text-foreground/40 line-through" : ""}`}>{bloco.t}</div>
        {bloco.d && <div className="text-[11px] text-foreground/50">{bloco.d}</div>}
      </div>
    </button>
  );
}

// Note a nova prop `onAbrirGerenciamento`
export function PlanoDiaCard({ data, titulo, onAbrirGerenciamento }: { data?: string; titulo?: string; onAbrirGerenciamento: () => void }) {
  const { user } = useAppUser();
  const userId = user?.id ?? (typeof localStorage !== "undefined" ? localStorage.getItem("revisaflash_user_id") : null);
  const { plano, feitos, carregando, alternar } = usePlano(userId);
  const [bauAberto, setBauAberto] = useState(false);

  const dataISO = data ?? hojeISO();
  const ehHoje = dataISO === hojeISO();
  const res = plano ? resolverDia(plano, dataISO) : null;

  const pendencias = useMemo(() => {
    if (!plano || !ehHoje) return [];
    const lista: any[] = [];
    for (const semana of plano.semanas) {
      for (let d = 0; d < 7; d++) {
        const dataStr = obterDataDoBloco(plano.data_inicio, semana.n, d);
        if (dataStr >= hojeISO()) continue;
        for (const bloco of semana.dias[d]) {
          const chave = chaveBloco(semana.n, d, bloco.k);
          if (!feitos.has(chave)) lista.push({ chave, bloco, dataStr });
        }
      }
    }
    return lista.sort((a, b) => a.dataStr.localeCompare(b.dataStr));
  }, [plano, feitos, ehHoje]);

  let feitosDoDia = 0;
  if (plano && res && res.tipo === "dia") feitosDoDia = res.blocos.filter(b => feitos.has(chaveBloco(res.semana.n, res.dow, b.k))).length;

  const tituloFinal = titulo ?? (ehHoje ? "Plano de hoje" : "Plano do dia");

  return (
    <>
      <div className="rf-card p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold">
              <CalendarCheck className="h-4 w-4 text-primary" /> {tituloFinal}
            </h3>
            {res && res.tipo === "dia" && <p className="mt-1 text-xs text-foreground/50">Semana {res.semana.n} de {res.total} · {res.rotulo}</p>}
          </div>
          <div className="flex items-center gap-2">
            {res && res.tipo === "dia" && res.blocos.length > 0 && <span className="text-xs font-medium tabular-nums text-foreground/50 mr-1">{feitosDoDia}/{res.blocos.length}</span>}
            {/* Botão de gerenciar agora chama a prop para trocar de tela */}
            {plano && (
              <button type="button" onClick={onAbrirGerenciamento} className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 transition-colors hover:bg-white/5 hover:text-foreground" title="Gerenciar plano">
                <Settings className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </header>

        {carregando ? (
          <p className="py-4 text-center text-xs text-foreground/40">Carregando plano…</p>
        ) : !plano ? (
          <div className="py-2 text-center">
            <p className="mb-3 text-sm text-foreground/55">Você ainda não cadastrou seu plano de estudos.</p>
            <button type="button" onClick={onAbrirGerenciamento} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">Cadastrar plano</button>
          </div>
        ) : res && res.tipo === "antes" ? (
          <p className="py-4 text-center text-sm text-foreground/50">Seu plano começa em {res.inicio.split("-").reverse().join("/")}.</p>
        ) : res && res.tipo === "depois" ? (
          <p className="py-4 text-center text-sm text-foreground/50">Plano concluído. Parabéns pela constância!</p>
        ) : res && res.tipo === "dia" && res.blocos.length === 0 ? (
          <p className="py-4 text-center text-sm text-foreground/50">Domingo: descanso total. Sem estudo.</p>
        ) : res && res.tipo === "dia" ? (
          <>
            <ul className="space-y-2">
              {res.blocos.map(b => {
                const chave = chaveBloco(res.semana.n, res.dow, b.k);
                return <li key={chave}><ItemBloco bloco={b} feito={feitos.has(chave)} onClick={() => alternar(chave)} /></li>;
              })}
            </ul>
            {ehHoje && pendencias.length > 0 && (
              <button onClick={() => setBauAberto(true)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-500 hover:bg-amber-500/20 transition-colors">
                <span className="flex items-center gap-2"><Archive className="h-4 w-4" /> {pendencias.length} {pendencias.length === 1 ? "matéria atrasada" : "matérias atrasadas"}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </>
        ) : null}
      </div>

      {bauAberto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 overflow-y-auto" onClick={() => setBauAberto(false)}>
          <div className="w-full max-w-lg my-8 rounded-3xl rf-card p-6" onClick={e => e.stopPropagation()}>
            <header className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-amber-500"><Archive className="h-5 w-5" /> Baú de Pendências</h2>
              <button onClick={() => setBauAberto(false)}><X className="h-5 w-5" /></button>
            </header>
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {pendencias.map(p => <li key={p.chave}><ItemBloco bloco={p.bloco} feito={false} onClick={() => alternar(p.chave)} dataAtrasada={p.dataStr} /></li>)}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}