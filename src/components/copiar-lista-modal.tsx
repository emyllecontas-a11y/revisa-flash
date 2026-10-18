// src/components/copiar-lista-modal.tsx
// Copia uma lista de questões de outra pessoa para a conta de quem está logada.
// Só o CONTEÚDO é copiado. Respostas, grifos e resultados da dona original não vêm.
import { useEffect, useState } from 'react';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { copiarListaParaMinhaConta } from '@/services/listaService';

interface Disciplina {
  id: string;
  name: string;
}

interface CopiarListaModalProps {
  listaId: string;
  listaTitulo: string;
  userId: string;
  onClose: () => void;
  onAbrirCopia: (novaListaId: string) => void;
}

export function CopiarListaModal({
  listaId,
  listaTitulo,
  userId,
  onClose,
  onAbrirCopia,
}: CopiarListaModalProps) {
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [disciplinaId, setDisciplinaId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [copiando, setCopiando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novaListaId, setNovaListaId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const client: any = await getSupabaseWithToken();
        const { data, error } = await client
          .from('disciplines')
          .select('id, name')
          .eq('user_id', userId)
          .eq('isDeleted', false)
          .order('name', { ascending: true });
        if (error) throw error;
        if (!ativo) return;
        const lista = (data ?? []) as Disciplina[];
        setDisciplinas(lista);
        if (lista.length > 0) setDisciplinaId(lista[0].id);
      } catch (e: any) {
        if (ativo) setErro(e?.message || 'Não consegui carregar suas disciplinas.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [userId]);

  async function copiar() {
    if (!disciplinaId || copiando) return;
    setCopiando(true);
    setErro(null);
    const res = await copiarListaParaMinhaConta(listaId, userId, disciplinaId);
    setCopiando(false);
    if (!res.success || !res.listaId) {
      setErro(res.error || 'Não consegui copiar a lista.');
      return;
    }
    if (res.imagensNaoCopiadas && res.imagensNaoCopiadas > 0) {
      setAviso(
        `${res.imagensNaoCopiadas} imagem(ns) não puderam ser copiadas e continuam apontando para a lista original.`,
      );
    }
    setNovaListaId(res.listaId);
  }

  const copiada = novaListaId !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Copiar para minha conta"
      onClick={copiando ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Copiar para minha conta</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{listaTitulo}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!copiada && (
            <>
              <p className="mb-3 text-sm">
                Você vai receber uma cópia só sua, que continua existindo mesmo que a dona apague a
                original. Suas respostas e grifos ficam só com você.
              </p>

              {carregando && (
                <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
              )}

              {!carregando && disciplinas.length === 0 && !erro && (
                <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                  Você ainda não tem nenhuma disciplina. Crie uma na tela Conteúdo e volte aqui.
                </p>
              )}

              {!carregando && disciplinas.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Em qual disciplina guardar?</span>
                  <select
                    value={disciplinaId}
                    onChange={(e) => setDisciplinaId(e.target.value)}
                    disabled={copiando}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {disciplinas.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {copiada && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Lista copiada! Ela agora é sua.</p>
              {aviso && (
                <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                  {aviso}
                </p>
              )}
            </div>
          )}

          {erro && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {!copiada ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={copiando}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={copiar}
                disabled={copiando || carregando || !disciplinaId}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {copiando ? 'Copiando…' : 'Copiar'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => novaListaId && onAbrirCopia(novaListaId)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Abrir minha cópia
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}