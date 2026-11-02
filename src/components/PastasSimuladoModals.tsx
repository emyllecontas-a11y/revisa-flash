// src/components/PastasSimuladoModals.tsx
import { useState } from 'react';
import {
  X, Loader2, Folder, FolderPlus, Pencil, Trash2,
  ChevronUp, ChevronDown, Check,
} from 'lucide-react';
import {
  criarPastaSimulado,
  renomearPastaSimulado,
  excluirPastaSimulado,
  moverSimuladoParaPasta,
  reordenarPastasSimulado,
  type SimuladoPasta,
} from '@/services/simuladoPastaService';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/components/ConfirmDialog';

// ============================================================
// 1. GERENCIAR PASTAS (criar, renomear, excluir, reordenar)
// ============================================================
interface GerenciarProps {
  userId: string;
  pastas: SimuladoPasta[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function GerenciarPastasSimuladoModal({
  userId, pastas, onClose, onChanged,
}: GerenciarProps) {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleCriar = async () => {
    if (!novoNome.trim() || criando) return;
    setCriando(true);
    try {
      const res = await criarPastaSimulado(userId, novoNome);
      if (res.success) {
        setNovoNome('');
        toast.success('Pasta criada');
        await onChanged();
      } else {
        toast.error(res.error || 'Erro ao criar pasta');
      }
    } finally {
      setCriando(false);
    }
  };

  const handleRenomear = async (pasta: SimuladoPasta) => {
    const novo = window.prompt('Novo nome da pasta:', pasta.name);
    if (!novo || !novo.trim() || novo.trim() === pasta.name) return;
    setBusyId(pasta.id);
    try {
      const res = await renomearPastaSimulado(pasta.id, userId, novo);
      if (res.success) {
        toast.success('Pasta renomeada');
        await onChanged();
      } else {
        toast.error(res.error || 'Erro ao renomear');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleExcluir = async (pasta: SimuladoPasta) => {
    const ok = await confirmDialog({
      title: `Excluir a pasta "${pasta.name}"?`,
      description: 'Os simulados dentro dela não são apagados — eles voltam para "Sem pasta".',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(pasta.id);
    try {
      const res = await excluirPastaSimulado(pasta.id, userId);
      if (res.success) {
        const n = res.simuladosMovidos || 0;
        toast.success('Pasta excluída', {
          description: n > 0
            ? `${n} simulado(s) movido(s) para "Sem pasta".`
            : undefined,
        });
        await onChanged();
      } else {
        toast.error(res.error || 'Erro ao excluir');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleMover = async (pasta: SimuladoPasta, dir: 'up' | 'down') => {
    const lista = [...pastas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = lista.findIndex((p) => p.id === pasta.id);
    if (idx === -1) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= lista.length) return;

    const nova = [...lista];
    [nova[idx], nova[newIdx]] = [nova[newIdx], nova[idx]];
    const itens = nova.map((p, i) => ({ id: p.id, order: i }));

    setBusyId(pasta.id);
    try {
      const res = await reordenarPastasSimulado(userId, itens);
      if (res.success) await onChanged();
      else toast.error(res.error || 'Erro ao reordenar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Gerenciar pastas</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Organize seus simulados em pastas.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Criar nova pasta */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/65">
              Nova pasta
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCriar()}
                placeholder="Ex: ENARE 2024, Cardio..."
                disabled={criando}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-foreground/40"
              />
              <button
                onClick={handleCriar}
                disabled={criando || !novoNome.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {criando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="h-3.5 w-3.5" />
                )}
                Criar
              </button>
            </div>
          </div>

          {/* Lista das pastas existentes */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-foreground/55">
              Pastas existentes ({pastas.length})
            </h3>

            {pastas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-foreground/50">
                Nenhuma pasta ainda. Crie a primeira acima.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {[...pastas]
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((p, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === pastas.length - 1;
                    const busy = busyId === p.id;
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-3 py-2"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {p.name}
                        </span>
                        <button
                          onClick={() => handleMover(p, 'up')}
                          disabled={busy || isFirst}
                          className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                          title="Mover para cima"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleMover(p, 'down')}
                          disabled={busy || isLast}
                          className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRenomear(p)}
                          disabled={busy}
                          className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                          title="Renomear"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleExcluir(p)}
                          disabled={busy}
                          className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          title="Excluir"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground/70 hover:bg-surface-2"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 2. MOVER SIMULADO PARA PASTA
// ============================================================
interface MoverProps {
  simulado: { id: string; titulo: string; folder_id?: string | null };
  pastas: SimuladoPasta[];
  userId: string;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function MoverSimuladoParaPastaModal({
  simulado, pastas, userId, onClose, onSuccess,
}: MoverProps) {
  const toast = useToast();
  const [selecionada, setSelecionada] = useState<string | null>(
    simulado.folder_id ?? null
  );
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const res = await moverSimuladoParaPasta(simulado.id, userId, selecionada);
      if (res.success) {
        toast.success(selecionada ? 'Simulado movido' : 'Simulado sem pasta');
        await onSuccess();
      } else {
        toast.error(res.error || 'Erro ao mover');
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Mover para pasta</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {simulado.titulo}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={salvando}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-foreground/50 hover:bg-white/5 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-1.5">
            <li>
              <button
                onClick={() => setSelecionada(null)}
                className={[
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                  selecionada === null
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface/40 hover:bg-surface-2',
                ].join(' ')}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-current">
                  {selecionada === null && <Check className="h-3 w-3" />}
                </span>
                <span className="font-medium">Sem pasta</span>
              </button>
            </li>
            {pastas.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-foreground/50">
                Nenhuma pasta ainda. Crie uma em "Pastas".
              </li>
            ) : (
              pastas
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((p) => {
                  const ativa = selecionada === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setSelecionada(p.id)}
                        className={[
                          'flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                          ativa
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface/40 hover:bg-surface-2',
                        ].join(' ')}
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-current">
                          {ativa && <Check className="h-3 w-3" />}
                        </span>
                        <Folder className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      </button>
                    </li>
                  );
                })
            )}
          </ul>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            disabled={salvando}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Movendo...</>
            ) : (
              <><Check className="h-4 w-4" /> Mover</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}