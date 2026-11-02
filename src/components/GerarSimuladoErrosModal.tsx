// src/components/GerarSimuladoErrosModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, CalendarDays, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useErrors } from '@/contexts/ErrorContext';
import {
  gerarSimuladoDosErros,
  erroTemDadosCompletos,
} from '@/services/gerarSimuladoErrosService';
import type { ErrorRecord } from '@/contexts/ErrorContext';

type Filtro = 'semana' | 'mes' | 'personalizado';

interface Props {
  userId: string;
  disciplineId: string;
  disciplineName: string;
  onClose: () => void;
  onSuccess: (simuladoId: string) => void;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function GerarSimuladoErrosModal({
  userId, disciplineId, disciplineName, onClose, onSuccess,
}: Props) {
  const { getErrorsByDiscipline } = useErrors();

  const [filtro, setFiltro] = useState<Filtro>('semana');
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toIsoDate(d);
  });
  const [dataFim, setDataFim] = useState<string>(() => toIsoDate(new Date()));

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState<string>('');
  const [nivel, setNivel] = useState<'Básico' | 'Intermediário' | 'Avançado'>('Intermediário');
  const [banca, setBanca] = useState<string>('');
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [tempoTotal, setTempoTotal] = useState<number>(30);

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<{ current: number; total: number; label: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Erros da disciplina que estão no período selecionado (só "ativos")
  const errosNoPeriodo = useMemo<ErrorRecord[]>(() => {
    const todos = getErrorsByDiscipline(disciplineId).filter(e => e.status === 'ativo');
    const agora = new Date();
    let inicio: Date;
    let fim: Date = agora;

    if (filtro === 'semana') {
      inicio = new Date();
      inicio.setDate(inicio.getDate() - 7);
    } else if (filtro === 'mes') {
      inicio = new Date();
      inicio.setDate(inicio.getDate() - 30);
    } else {
      inicio = new Date(dataInicio + 'T00:00:00');
      fim = new Date(dataFim + 'T23:59:59');
    }

    return todos.filter(e => {
      const t = new Date(e.createdAt).getTime();
      return !Number.isNaN(t) && t >= inicio.getTime() && t <= fim.getTime();
    });
  }, [getErrorsByDiscipline, disciplineId, filtro, dataInicio, dataFim]);

  const { completos, incompletos } = useMemo(() => {
    const completos: ErrorRecord[] = [];
    const incompletos: ErrorRecord[] = [];
    for (const e of errosNoPeriodo) {
      if (erroTemDadosCompletos(e)) completos.push(e);
      else incompletos.push(e);
    }
    return { completos, incompletos };
  }, [errosNoPeriodo]);

  // Seleciona todos os completos por padrão (e reseta quando filtro muda)
  useEffect(() => {
    setSelecionados(new Set(completos.map(e => e.id)));
  }, [completos]);

  // Auto-preenche título (só sobrescreve se ainda for default/auto)
  useEffect(() => {
    const periodoLabel =
      filtro === 'semana' ? 'Semana' :
      filtro === 'mes' ? 'Mês' :
      `${formatarData(dataInicio)} a ${formatarData(dataFim)}`;
    const autoTitulo = `Erros · ${disciplineName} · ${periodoLabel}`;
    setTitulo(prev => (!prev || prev.startsWith('Erros · ') ? autoTitulo : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, dataInicio, dataFim, disciplineName]);

  // Tempo total proporcional ao número de questões (3 min por questão, mínimo 10)
  useEffect(() => {
    setTempoTotal(Math.max(10, selecionados.size * 3));
  }, [selecionados]);

  const periodoInvalido =
    filtro === 'personalizado' &&
    (!dataInicio || !dataFim || dataInicio > dataFim);

  const toggleErro = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodos = () => {
    setSelecionados(new Set(completos.map(e => e.id)));
  };

  const desmarcarTodos = () => {
    setSelecionados(new Set());
  };

  const handleGerar = async () => {
    if (selecionados.size === 0 || periodoInvalido || gerando) return;
    setGerando(true);
    setErro(null);
    setProgresso(null);
    try {
      const res = await gerarSimuladoDosErros({
        userId,
        disciplineId,
        errosIds: [...selecionados],
        titulo: titulo.trim() || `Erros · ${disciplineName}`,
        nivel,
        area: disciplineName,
        banca: banca.trim(),
        ano,
        tempoTotal,
        onProgress: (info) => setProgresso(info),
      });
      if (res.success && res.simuladoId) {
        onSuccess(res.simuladoId);
      } else {
        setErro(res.error || 'Erro ao gerar simulado.');
      }
    } catch (e: any) {
      setErro(e?.message || 'Erro inesperado.');
    } finally {
      setGerando(false);
      setProgresso(null);
    }
  };

  const podeGerar =
    !gerando &&
    !periodoInvalido &&
    selecionados.size > 0 &&
    titulo.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:rounded-2xl">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Gerar simulado dos erros</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{disciplineName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={gerando}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Conteúdo */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Filtro de período */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-foreground/55">
              <CalendarDays className="h-3.5 w-3.5" /> Período
            </h3>
            <div className="flex flex-wrap gap-2">
              {([
                ['semana', 'Últimos 7 dias'],
                ['mes', 'Últimos 30 dias'],
                ['personalizado', 'Personalizado'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFiltro(k)}
                  disabled={gerando}
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    filtro === k
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-surface text-foreground/70 hover:bg-surface-2',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {filtro === 'personalizado' && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-foreground/60">De</span>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    disabled={gerando}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-foreground/60">Até</span>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    disabled={gerando}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>
            )}

            {periodoInvalido && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                A data inicial precisa ser menor ou igual à data final.
              </p>
            )}
          </section>

          {/* Preview */}
          <section>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-surface/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/45">No período</div>
                <div className="mt-1 font-display text-xl font-semibold tabular-nums">{errosNoPeriodo.length}</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-primary/80">Completos</div>
                <div className="mt-1 font-display text-xl font-semibold tabular-nums text-primary">{completos.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface/40 p-3">
                <div className="text-[10px] font-medium uppercase tracking-widest text-foreground/45">Sem dados</div>
                <div className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground/60">{incompletos.length}</div>
              </div>
            </div>

            {incompletos.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <strong>{incompletos.length} erro(s)</strong> antigo(s) não têm dados suficientes
                  (alternativas/gabarito/imagem) e <strong>não entrarão</strong> no simulado.
                  Só erros registrados depois da atualização têm esses dados.
                </span>
              </p>
            )}
          </section>

          {/* Lista de erros para incluir */}
          {completos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-foreground/50">
              Nenhum erro com dados completos no período selecionado.
              {incompletos.length > 0 && ' Só há erros antigos, sem dados para incluir.'}
            </p>
          ) : (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground/55">
                  Incluir ({selecionados.size} de {completos.length})
                </h3>
                <div className="flex gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selecionarTodos}
                    disabled={gerando || selecionados.size === completos.length}
                    className="font-medium text-primary hover:underline disabled:opacity-40"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={desmarcarTodos}
                    disabled={gerando || selecionados.size === 0}
                    className="font-medium text-foreground/60 hover:underline disabled:opacity-40"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-surface/30 p-2">
                {completos.map((e) => {
                  const marcado = selecionados.has(e.id);
                  const truncado = e.question.length > 90 ? e.question.slice(0, 90) + '…' : e.question;
                  return (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleErro(e.id)}
                          disabled={gerando}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs leading-snug text-foreground/85">{truncado}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-foreground/45">
                            {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                            {e.topic ? ` · ${e.topic}` : ''}
                            {e.repetitions > 0 ? ` · ${e.repetitions}x` : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Configurações */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-foreground/55">
              Configurações do simulado
            </h3>
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-foreground/60">Título</span>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  disabled={gerando}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-foreground/60">Nível</span>
                  <select
                    value={nivel}
                    onChange={(e) => setNivel(e.target.value as any)}
                    disabled={gerando}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option>Básico</option>
                    <option>Intermediário</option>
                    <option>Avançado</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-foreground/60">Banca (opcional)</span>
                  <input
                    type="text"
                    value={banca}
                    onChange={(e) => setBanca(e.target.value)}
                    disabled={gerando}
                    placeholder="Ex.: ENARE"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-foreground/35"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-foreground/60">Tempo (min)</span>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={tempoTotal}
                    onChange={(e) => setTempoTotal(parseInt(e.target.value || '0', 10) || 0)}
                    disabled={gerando}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary tabular-nums"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Progresso */}
          {progresso && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-primary">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{progresso.label}</span>
                </div>
                {progresso.total > 0 && (
                  <span className="tabular-nums font-semibold">
                    {progresso.current}/{progresso.total}
                  </span>
                )}
              </div>
              {progresso.total > 0 && (
                <div className="h-1.5 overflow-hidden rounded-full bg-primary/20">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, Math.round((progresso.current / progresso.total) * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {erro && (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {erro}
            </p>
          )}
        </div>

        {/* Rodapé */}
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={gerando}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGerar}
            disabled={!podeGerar}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {gerando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Gerar simulado ({selecionados.size})</>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}