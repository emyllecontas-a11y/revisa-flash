// src/components/compartilhar-modal.tsx
// Usa as funções do seu src/services/shareService.ts (listSharesOfItem, addShare, removeShare).
import { useEffect, useState } from 'react';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import {
  addShare,
  listSharesOfItem,
  removeShare,
  type ShareItemType,
} from '@/services/shareService';

interface Amiga {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
}

// Amigas com convite ACEITO (nos dois sentidos). A segurança real continua no RLS.
async function carregarAmigasAceitas(myId: string): Promise<Amiga[]> {
  const supabase: any = await getSupabaseWithToken();

  const { data: amizades, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
  if (error) throw error;

  const ids: string[] = Array.from(
    new Set(
      (amizades ?? []).map((a: any) =>
        a.requester_id === myId ? a.addressee_id : a.requester_id,
      ),
    ),
  );
  if (ids.length === 0) return [];

  const { data: perfis, error: erroPerfis } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, email')
    .in('id', ids);
  if (erroPerfis) throw erroPerfis;

  const porId = new Map<string, any>((perfis ?? []).map((p: any) => [p.id, p]));
  return ids
    .map((id) => {
      const p = porId.get(id);
      return {
        id,
        name: p?.name || p?.email || 'Amiga',
        avatar_url: p?.avatar_url ?? null,
        email: p?.email ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  itemType: ShareItemType;
  itemId: string;
  itemName: string;
  /** Chamado depois de salvar (a tela pode atualizar o selo "compartilhado"). */
  onChanged?: () => void;
}

const AVISO_TIPO: Partial<Record<ShareItemType, string>> = {
  discipline:
    'Compartilhar uma disciplina também compartilha todos os tópicos e arquivos dela, inclusive os que você criar depois.',
  topic: 'Compartilhar um tópico também compartilha os arquivos dentro dele.',
};

export function CompartilharModal({
  open,
  onClose,
  userId,
  itemType,
  itemId,
  itemName,
  onChanged,
}: Props) {
  const [amigas, setAmigas] = useState<Amiga[]>([]);
  // amiga -> id da linha em "shares" (só de quem já tem acesso)
  const [atuais, setAtuais] = useState<Record<string, string>>({});
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const [lista, shares] = await Promise.all([
          carregarAmigasAceitas(userId),
          listSharesOfItem(userId, itemType, itemId),
        ]);
        if (cancelado) return;
        const mapa: Record<string, string> = {};
        shares.forEach((s) => {
          mapa[s.shared_with_id] = s.id;
        });
        setAmigas(lista);
        setAtuais(mapa);
        setMarcadas(Object.keys(mapa));
      } catch (e: any) {
        console.error('[Compartilhar] erro ao carregar', e);
        if (!cancelado)
          setErro(e?.message || 'Não foi possível carregar suas amigas. Tente de novo.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, userId, itemType, itemId]);

  if (!open) return null;

  const idsAtuais = Object.keys(atuais);
  const alternar = (id: string) =>
    setMarcadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const mudou =
    marcadas.length !== idsAtuais.length || marcadas.some((id) => !idsAtuais.includes(id));

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const falhas: string[] = [];

    for (const amigaId of marcadas.filter((id) => !idsAtuais.includes(id))) {
      try {
        await addShare(userId, amigaId, itemType, itemId);
      } catch (e: any) {
        falhas.push(e?.message || 'Não foi possível compartilhar.');
      }
    }
    for (const amigaId of idsAtuais.filter((id) => !marcadas.includes(id))) {
      try {
        await removeShare(atuais[amigaId]);
      } catch (e: any) {
        falhas.push(e?.message || 'Não foi possível remover o acesso.');
      }
    }

    setSalvando(false);
    onChanged?.();
    if (falhas.length === 0) {
      onClose();
    } else {
      setErro(Array.from(new Set(falhas)).join(' '));
    }
  };

  const aviso = AVISO_TIPO[itemType];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar com amigas"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Compartilhar com amigas</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{itemName}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm">
            Suas amigas verão o conteúdo, mas grifos, respostas e resultados continuam só de cada
            uma.
          </p>
          {aviso && (
            <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              {aviso}
            </p>
          )}

          {carregando && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          )}

          {!carregando && amigas.length === 0 && !erro && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Você ainda não tem amigas com convite aceito. Convide alguém na tela Amigas.
            </p>
          )}

          {!carregando && amigas.length > 0 && (
            <ul className="divide-y divide-border">
              {amigas.map((a) => {
                const jaTem = idsAtuais.includes(a.id);
                const marcada = marcadas.includes(a.id);
                return (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0"
                        checked={marcada}
                        onChange={() => alternar(a.id)}
                      />
                      {a.avatar_url ? (
                        <img
                          src={a.avatar_url}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                          {a.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        {a.email && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.email}
                          </span>
                        )}
                      </span>
                      {jaTem && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {marcada ? 'Já tem acesso' : 'Será removido'}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {erro && (
            <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || carregando || !mudou}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}