// src/routes/amigas.tsx
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Check, Loader2, RefreshCw, Search, Send, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAppUser } from "@/contexts/UserContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import type { PessoaEncontrada } from "@/services/clerkService";
import {
  acceptInvite,
  friendErrorMessage,
  loadFriendsOverview,
  relationWith,
  removeFriendship,
  searchPerson,
  sendInvite,
  type FriendEntry,
  type FriendsOverview,
  type PessoaInfo,
  type Relation,
} from "@/services/friendService";

type SearchResult =
  | { kind: "notfound" }
  | { kind: "found"; pessoa: PessoaEncontrada; relation: Relation; friendshipId?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PessoaBasica = { name: string | null; email: string | null };

function displayName(p: PessoaBasica): string {
  return p.name || p.email || "Pessoa";
}

function initialOf(p: PessoaBasica): string {
  return displayName(p).trim().charAt(0).toUpperCase() || "?";
}

export default function AmigasPage() {
  const { userId } = useAppUser();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [overview, setOverview] = useState<FriendsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  /** id da linha em andamento (para desabilitar botões) ou "invite" */
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(
    async (silent = false) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      try {
        const data = await loadFriendsOverview(userId);
        setOverview(data);
        setLoadError(null);
      } catch (e) {
        setLoadError(friendErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ao voltar para a aba, atualiza (pode ter chegado convite novo)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // ------------------------------------------------------------
  // Buscar pessoa por e-mail
  // ------------------------------------------------------------
  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      toast.error("Digite um e-mail válido.");
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const pessoa = await searchPerson(value);
      if (!pessoa) {
        setResult({ kind: "notfound" });
      } else {
        const rel = relationWith(overview, pessoa.userId);
        setResult({ kind: "found", pessoa, relation: rel.relation, friendshipId: rel.friendshipId });
      }
    } catch (err) {
      toast.error(friendErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  // ------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------
  const handleInvite = async (pessoa: PessoaEncontrada) => {
    if (!userId || busy) return;
    setBusy("invite");
    try {
      await sendInvite(userId, pessoa.userId);
      toast.success("Convite enviado!", {
        description: `${displayName(pessoa)} precisa aceitar para vocês virarem amigas.`,
      });
      setResult(null);
      setEmail("");
      await refresh(true);
    } catch (err) {
      toast.error(friendErrorMessage(err));
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = async (entry: FriendEntry) => {
    if (busy) return;
    setBusy(entry.friendshipId);
    try {
      await acceptInvite(entry.friendshipId);
      toast.success(`Agora você e ${displayName(entry.pessoa)} são amigas!`);
      await refresh(true);
    } catch (err) {
      toast.error(friendErrorMessage(err));
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async (entry: FriendEntry) => {
    if (busy) return;
    setBusy(entry.friendshipId);
    try {
      await removeFriendship(entry.friendshipId);
      toast.info("Convite recusado.");
      await refresh(true);
    } catch (err) {
      toast.error(friendErrorMessage(err));
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async (entry: FriendEntry) => {
    if (busy) return;
    setBusy(entry.friendshipId);
    try {
      await removeFriendship(entry.friendshipId);
      toast.info("Convite cancelado.");
      await refresh(true);
    } catch (err) {
      toast.error(friendErrorMessage(err));
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveFriend = async (entry: FriendEntry) => {
    if (busy) return;
    const ok = await confirmDialog({
      title: `Remover ${displayName(entry.pessoa)} das suas amigas?`,
      description:
        "Os compartilhamentos entre vocês duas também serão desfeitos: ela deixa de ver o que você compartilhou e você deixa de ver o que ela compartilhou. Os grifos, respostas e resultados de cada uma continuam só de cada uma.",
      confirmText: "Remover",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    setBusy(entry.friendshipId);
    try {
      await removeFriendship(entry.friendshipId);
      toast.success("Amizade removida.");
      await refresh(true);
    } catch (err) {
      toast.error(friendErrorMessage(err));
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  const recebidos = overview?.recebidos ?? [];
  const enviados = overview?.enviados ?? [];
  const amigas = overview?.amigas ?? [];

  return (
    <AppShell breadcrumb="Amigas" title="Amigas">
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm text-foreground/60">
          Amigas podem receber o conteúdo que você compartilhar (disciplinas, PDFs, listas de
          questões e simulados). Seus grifos, respostas e resultados continuam só seus.
        </p>

        {/* ---------- Convidar ---------- */}
        <section className="rf-card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <UserPlus className="h-4 w-4 text-primary" /> Convidar uma amiga
          </h2>
          <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setResult(null);
              }}
              placeholder="E-mail da sua amiga"
              aria-label="E-mail da amiga"
              className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={searching || !email.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </form>
          <p className="mt-2 text-xs text-foreground/40">
            Ela precisa já ter conta no RevisaFlash com esse e-mail.
          </p>

          {result?.kind === "notfound" && (
            <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-foreground/60">
              Não encontramos ninguém com esse e-mail. Confira se digitou certo e se ela já criou
              a conta no RevisaFlash.
            </div>
          )}

          {result?.kind === "found" && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar pessoa={result.pessoa} />
                <PessoaLinha pessoa={result.pessoa} />
              </div>
              <div className="shrink-0">
                {result.relation === "none" && (
                  <button
                    onClick={() => void handleInvite(result.pessoa)}
                    disabled={busy === "invite"}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:w-auto"
                  >
                    {busy === "invite" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Enviar convite
                  </button>
                )}
                {result.relation === "friend" && (
                  <span className="text-xs font-medium text-foreground/60">Vocês já são amigas.</span>
                )}
                {result.relation === "sent" && (
                  <span className="text-xs font-medium text-foreground/60">
                    Convite já enviado. Aguardando ela aceitar.
                  </span>
                )}
                {result.relation === "received" && (
                  <span className="text-xs font-medium text-primary">
                    Ela já te convidou! Aceite em "Convites recebidos".
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {loadError && (
          <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
            </button>
          </div>
        )}

        {loading && !overview ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ---------- Convites recebidos ---------- */}
            <Section title="Convites recebidos" count={recebidos.length} highlight={recebidos.length > 0}>
              {recebidos.length === 0 ? (
                <Vazio texto="Nenhum convite recebido por enquanto." />
              ) : (
                recebidos.map((entry) => (
                  <Linha key={entry.friendshipId} pessoa={entry.pessoa}>
                    <button
                      onClick={() => void handleAccept(entry)}
                      disabled={busy === entry.friendshipId}
                      className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Aceitar
                    </button>
                    <button
                      onClick={() => void handleDecline(entry)}
                      disabled={busy === entry.friendshipId}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Recusar
                    </button>
                  </Linha>
                ))
              )}
            </Section>

            {/* ---------- Minhas amigas ---------- */}
            <Section title="Minhas amigas" count={amigas.length}>
              {amigas.length === 0 ? (
                <Vazio texto="Você ainda não tem amigas no RevisaFlash. Convide alguém pelo e-mail acima." />
              ) : (
                amigas.map((entry) => (
                  <Linha key={entry.friendshipId} pessoa={entry.pessoa}>
                    <button
                      onClick={() => void handleRemoveFriend(entry)}
                      disabled={busy === entry.friendshipId}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
                    >
                      <UserMinus className="h-3.5 w-3.5" /> Remover
                    </button>
                  </Linha>
                ))
              )}
            </Section>

            {/* ---------- Convites enviados ---------- */}
            {enviados.length > 0 && (
              <Section title="Convites enviados" count={enviados.length}>
                {enviados.map((entry) => (
                  <Linha key={entry.friendshipId} pessoa={entry.pessoa} sub="Aguardando resposta">
                    <button
                      onClick={() => void handleCancel(entry)}
                      disabled={busy === entry.friendshipId}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-2 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </button>
                  </Linha>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// ============================================================
// Pedaços de tela
// ============================================================
function Section({
  title,
  count,
  highlight,
  children,
}: {
  title: string;
  count: number;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-display text-base font-bold">
        <Users className="h-4 w-4 text-foreground/40" />
        {title}
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
            highlight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/60",
          ].join(" ")}
        >
          {count}
        </span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-foreground/50">
      {texto}
    </div>
  );
}

function Avatar({ pessoa }: { pessoa: PessoaBasica }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
      {initialOf(pessoa)}
    </div>
  );
}

function PessoaLinha({
  pessoa,
  sub,
}: {
  pessoa: PessoaBasica;
  sub?: string;
}) {
  const nome = displayName(pessoa);
  const email = pessoa.email && pessoa.email !== nome ? pessoa.email : null;
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold">{nome}</div>
      {(email || sub) && (
        <div className="truncate text-xs text-foreground/50">{sub ?? email}</div>
      )}
    </div>
  );
}

function Linha({
  pessoa,
  sub,
  children,
}: {
  pessoa: PessoaInfo;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar pessoa={pessoa} />
        <PessoaLinha pessoa={pessoa} sub={sub} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}