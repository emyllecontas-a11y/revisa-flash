// src/components/ShareDialog.tsx
//
// Botão "Compartilhar" + janela com a lista de amigas (caixas de marcar).
// Marcar = compartilha na hora. Desmarcar = remove o acesso na hora.
//
// Como usar numa tela (só para itens que são SEUS):
//   <ShareButton itemType="simulado" itemId={simulado.id} itemTitle={simulado.titulo} />
//
// itemType: 'discipline' | 'topic' | 'file' | 'question_list' | 'simulado'

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Loader2, Share2, X } from "lucide-react";
import { useAppUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/useToast";
import {
  friendErrorMessage,
  listAcceptedFriends,
  type PessoaInfo,
} from "@/services/friendService";
import {
  addShare,
  listSharesOfItem,
  removeShare,
  type ShareItemType,
  type ShareRow,
} from "@/services/shareService";

const AVISO_FIXO =
  "Suas amigas verão o conteúdo, mas grifos, respostas e resultados continuam só de cada uma.";

const AVISO_POR_TIPO: Partial<Record<ShareItemType, string>> = {
  discipline:
    "Os tópicos e os arquivos desta disciplina vão junto, inclusive os que você criar depois.",
  topic: "Os arquivos deste tópico vão junto, inclusive os que você adicionar depois.",
  file: "Só este arquivo será compartilhado.",
  question_list: "Elas poderão responder a lista e ver só os próprios resultados.",
  simulado: "Elas poderão responder o simulado e ver só os próprios resultados.",
};

const NOME_DO_TIPO: Record<ShareItemType, string> = {
  discipline: "disciplina",
  topic: "tópico",
  file: "arquivo",
  question_list: "lista",
  simulado: "simulado",
};

function displayName(p: { name: string | null; email: string | null }): string {
  return p.name || p.email || "Pessoa";
}

// ============================================================
// Janela
// ============================================================
export function ShareDialog({
  itemType,
  itemId,
  itemTitle,
  onClose,
}: {
  itemType: ShareItemType;
  itemId: string;
  itemTitle?: string;
  onClose: () => void;
}) {
  const { userId } = useAppUser();
  const toast = useToast();

  const [friends, setFriends] = useState<PessoaInfo[] | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [amigas, compartilhados] = await Promise.all([
        listAcceptedFriends(userId),
        listSharesOfItem(userId, itemType, itemId),
      ]);
      setFriends(amigas);
      setShares(compartilhados);
      setLoadError(null);
    } catch (e) {
      setLoadError(friendErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId, itemType, itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Esc fecha a janela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shareByFriend = useMemo(() => {
    const m = new Map<string, ShareRow>();
    for (const s of shares) m.set(s.shared_with_id, s);
    return m;
  }, [shares]);

  const toggle = async (friend: PessoaInfo) => {
    if (!userId || busyId) return;
    const existing = shareByFriend.get(friend.id);
    setBusyId(friend.id);
    try {
      if (existing) {
        await removeShare(existing.id);
        toast.info(`${displayName(friend)} não tem mais acesso.`);
      } else {
        await addShare(userId, friend.id, itemType, itemId);
        toast.success(`Compartilhado com ${displayName(friend)}.`);
      }
    } catch (e) {
      toast.error(friendErrorMessage(e));
    } finally {
      // Sempre confere o que está de fato no servidor
      try {
        setShares(await listSharesOfItem(userId, itemType, itemId));
      } catch {
        /* mantém o que já estava na tela */
      }
      setBusyId(null);
    }
  };

  const aviso = AVISO_POR_TIPO[itemType];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 id="share-dialog-title" className="font-display text-base font-bold">
              Compartilhar {NOME_DO_TIPO[itemType]}
            </h2>
            {itemTitle && (
              <p className="truncate text-xs text-foreground/50">{itemTitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-foreground/60 hover:bg-surface-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-xs text-foreground/60">{AVISO_FIXO}</p>
          {aviso && <p className="text-xs font-medium text-foreground/70">{aviso}</p>}

          {loading && !friends ? (
            <div className="flex min-h-[96px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : loadError ? (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
              >
                Tentar de novo
              </button>
            </div>
          ) : friends && friends.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-foreground/60">
              Você ainda não tem amigas para compartilhar.{" "}
              <Link to="/amigas" onClick={onClose} className="font-semibold text-primary underline">
                Convidar uma amiga
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {(friends ?? []).map((f) => {
                const marcada = shareByFriend.has(f.id);
                const ocupada = busyId === f.id;
                const nome = displayName(f);
                const email = f.email && f.email !== nome ? f.email : null;
                return (
                  <li key={f.id}>
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5",
                        marcada ? "border-primary/50 bg-primary/5" : "border-border bg-surface",
                        busyId && !ocupada ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[var(--color-primary,#6d28d9)]"
                        checked={marcada}
                        disabled={busyId !== null}
                        onChange={() => void toggle(f)}
                      />
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {nome.trim().charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{nome}</div>
                        {email && (
                          <div className="truncate text-xs text-foreground/50">{email}</div>
                        )}
                      </div>
                      {ocupada ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : marcada ? (
                        <span className="shrink-0 text-[11px] font-semibold text-primary">
                          Tem acesso
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rodapé */}
        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ============================================================
// Botão (abre a janela sozinho)
// ============================================================
export function ShareButton({
  itemType,
  itemId,
  itemTitle,
  className,
  label = "Compartilhar",
  iconOnly = false,
}: {
  itemType: ShareItemType;
  itemId: string;
  itemTitle?: string;
  className?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title="Compartilhar com amigas"
        aria-label={`Compartilhar ${itemTitle ?? NOME_DO_TIPO[itemType]}`}
        onClick={(e) => {
          e.stopPropagation(); // não "clica" no cartão que está por trás
          setOpen(true);
        }}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2"
        }
      >
        <Share2 className="h-3.5 w-3.5" />
        {!iconOnly && label}
      </button>
      {open && (
        <ShareDialog
          itemType={itemType}
          itemId={itemId}
          itemTitle={itemTitle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}