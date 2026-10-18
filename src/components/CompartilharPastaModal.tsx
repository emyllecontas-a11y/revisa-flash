// src/components/CompartilharPastaModal.tsx
//
// Compartilha uma pasta inteira (Caminho A): cria um share por lista da pasta.
// O estado "já tem X de Y" é derivado de quantas listas da pasta o amigo vê.
// Ao marcar um amigo, compartilha as listas que faltam.
// Ao desmarcar um amigo que já tinha, remove todos os shares dele dessas listas.
import { useEffect, useState } from 'react';
import { getSupabaseWithToken } from '@/lib/supabaseClient';
import {
  addShare,
  listSharesOfListas,
  removeShare,
  type ShareRow,
} from '@/services/shareService';
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
  pastaNome: string;
  listaIds: string[];
  onChanged?: () => void;
}

type MapaShares = Record<string, Record<string, string>>; // amigoId -> itemId -> shareId

export function CompartilharPastaModal({
  open,
  onClose,
  userId,
  pastaNome,
  listaIds,
  onChanged,
}: Props) {
  const [amigas, setAmigas] = useState<Amiga[]>([]);
  const [mapaShares, setMapaShares] = useState<MapaShares>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [originalMarcadas, setOriginalMarcadas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);

  const totalListas = listaIds.length;

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro(null);
      setProgresso(null);
      try {
        const [lista, shares]: [Amiga[], ShareRow[]] = await Promise.all([
          carregarAmigasAceitas(userId),
          listSharesOfListas(userId, listaIds),
        ]);
        if (cancelado) return;

        const mapa: MapaShares = {};
        for (const s of shares) {
          if (!s.item_id) continue;
          if (!mapa[s.shared_with_id]) mapa[s.shared_with_id] = {};
          mapa[s.shared_with_id][s.item_id] = s.id;
        }

        const iniciais = new Set<string>();
        for (const a of lista) {
          const tenho = mapa[a.id];
          if (tenho && Object.keys(tenho).length === totalListas) {
            iniciais.add(a.id);
          }
        }
        setAmigas(lista);
        setMapaShares(mapa);
        setMarcadas(new Set(iniciais));
        setOriginalMarcadas(new Set(iniciais));
      } catch (e: any) {
        console.error('[CompartilharPasta] erro ao carregar', e);
        if (!cancelado) setErro(e?.message || 'Não foi possível carregar as amigas.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, listaIds.join(','), totalListas]);

  if (!open) return null;

  const totalDoAmigo = (id: string) => Object.keys(mapaShares[id] || {}).length;
  const estadoDe = (id: string): 'todos' | 'parcial' | 'nenhum' => {
    const t = totalDoAmigo(id);
    if (t === 0) return 'nenhum';
    if (t === totalListas) return 'todos';
    return 'parcial';
  };

  const alternar = (id: string) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const semAlteracao = (() => {
    for (const a of amigas) {
      if (originalMarcadas.has(a.id) !== marcadas.has(a.id)) return false;
    }
    return true;
  })();

  const salvar = async () => {
    if (totalListas === 0) { onClose(); return; }
    setSalvando(true);
    setErro(null);
    setProgresso(null);

    const falhas: string[] = [];
    const listaIdSet = new Set(listaIds);

    // Total de operações para o progresso
    let totalOps = 0;
    for (const a of amigas) {
      if (originalMarcadas.has(a.id) === marcadas.has(a.id)) continue;
      const tenho = mapaShares[a.id] || {};
      if (marcadas.has(a.id)) {
        for (const itemId of listaIds) if (!tenho[itemId]) totalOps++;
      } else {
        for (const itemId of Object.keys(tenho)) if (listaIdSet.has(itemId)) totalOps++;
      }
    }

    if (totalOps === 0) { onClose(); return; }

    let op = 0;

    for (const a of amigas) {
      const eraMarcada = originalMarcadas.has(a.id);
      const agoraMarcada = marcadas.has(a.id);
      if (eraMarcada === agoraMarcada) continue;

      const tenho = mapaShares[a.id] || {};

      if (agoraMarcada) {
        for (const itemId of listaIds) {
          if (tenho[itemId]) continue;
          op++;
          setProgresso(`Compartilhando ${op} de ${totalOps}...`);
          try {
            await addShare(userId, a.id, 'question_list', itemId);
          } catch (e: any) {
            falhas.push(`Não consegui compartilhar com ${a.name}: ${e?.message || 'erro'}`);
          }
        }
      } else {
        for (const itemId of Object.keys(tenho)) {
          if (!listaIdSet.has(itemId)) continue;
          op++;
          setProgresso(`Removendo ${op} de ${totalOps}...`);
          try {
            await removeShare(tenho[itemId]);
          } catch (e: any) {
            falhas.push(`Não consegui remover acesso de ${a.name}: ${e?.message || 'erro'}`);
          }
        }
      }
    }

    setSalvando(false);
    onChanged?.();

    if (falhas.length === 0) onClose();
    else setErro(Array.from(new Set(falhas)).join(' '));
  };

  const aviso =
    totalListas === 0
      ? 'Esta pasta está vazia. Adicione listas antes de compartilhar.'
      : `${totalListas} ${totalListas === 1 ? 'lista' : 'listas'} nesta pasta. Se você adicionar novas listas depois, compartilhe novamente.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar pasta"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-background text-foreground shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Compartilhar pasta</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {pastaNome} · {totalListas} {totalListas === 1 ? 'lista' : 'listas'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">{aviso}</p>

          {carregando && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          )}

          {!carregando && amigas.length === 0 && !erro && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Você ainda não tem amigas com convite aceito. Convide alguém na tela Amigas.
            </p>
          )}

          {!carregando && amigas.length > 0 && totalListas > 0 && (
            <ul className="divide-y divide-border">
              {amigas.map((a) => {
                const marcada = marcadas.has(a.id);
                const estado = estadoDe(a.id);
                const totalAmigo = totalDoAmigo(a.id);
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
                      {estado === 'todos' && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          <Check className="mr-0.5 inline h-3 w-3 text-primary" /> Tem todas
                        </span>
                      )}
                      {estado === 'parcial' && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Já tem {totalAmigo} de {totalListas}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {progresso && (
            <p className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progresso}
            </p>
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
            disabled={salvando || carregando || semAlteracao || totalListas === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}