// src/components/CompartilharCadernoModal.tsx
import { useEffect, useState } from 'react';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import { addShare, listSharesOfItem, removeShare } from '@/services/shareService';
import { Loader2, Check } from 'lucide-react';

interface Amiga {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
}

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
  cadernoId: string;
  cadernoNome: string;
  onChanged?: () => void;
}

export function CompartilharCadernoModal({
  open,
  onClose,
  userId,
  cadernoId,
  cadernoNome,
  onChanged,
}: Props) {
  const [amigas, setAmigas] = useState<Amiga[]>([]);
  const [sharesExistentes, setSharesExistentes] = useState<Record<string, string>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
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
          listSharesOfItem(userId, 'caderno_banco', cadernoId),
        ]);
        if (cancelado) return;
        const mapa: Record<string, string> = {};
        for (const s of shares) mapa[s.shared_with_id] = s.id;
        setAmigas(lista);
        setSharesExistentes(mapa);
        setMarcadas(new Set(Object.keys(mapa)));
      } catch (e: any) {
        console.error('[CompartilharCaderno] erro ao carregar', e);
        if (!cancelado) setErro(e?.message || 'Não foi possível carregar as amigas.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [open, userId, cadernoId]);

  if (!open) return null;

  const alternar = (id: string) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const falhas: string[] = [];
    const jaTinham = new Set(Object.keys(sharesExistentes));

    for (const a of amigas) {
      const tinhaAntes = jaTinham.has(a.id);
      const marcadaAgora = marcadas.has(a.id);
      if (tinhaAntes === marcadaAgora) continue;
      try {
        if (marcadaAgora) {
          await addShare(userId, a.id, 'caderno_banco', cadernoId);
        } else {
          await removeShare(sharesExistentes[a.id]);
        }
      } catch (e: any) {
        falhas.push(`Erro com ${a.name}: ${e?.message || 'erro'}`);
      }
    }

    setSalvando(false);
    onChanged?.();
    if (falhas.length === 0) onClose();
    else setErro(Array.from(new Set(falhas)).join(' '));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Compartilhar caderno</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{cadernoNome}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
            Suas amigas vão poder copiar este caderno e responder. Os pontos vão para o ranking delas.
          </p>

          {carregando && <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>}

          {!carregando && amigas.length === 0 && !erro && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Você ainda não tem amigas com convite aceito. Convide alguém na tela Amigas.
            </p>
          )}

          {!carregando && amigas.length > 0 && (
            <ul className="divide-y divide-border">
              {amigas.map((a) => {
                const marcada = marcadas.has(a.id);
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
                        <img src={a.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                          {a.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        {a.email && (
                          <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                        )}
                      </span>
                      {marcada && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {erro && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
            disabled={salvando || carregando}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {salvando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}