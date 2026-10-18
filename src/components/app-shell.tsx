// src/components/app-shell.tsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Home, BookOpen, Calendar, AlertTriangle, Layers, FileText, Settings,
  Flame, LogOut, ChevronRight, User, Zap, RefreshCw, Loader2, Timer, MoreHorizontal, X, Users
} from "lucide-react";
import type { ReactNode } from "react";
import { useAppUser } from "@/contexts/UserContext";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { useClerk } from "@clerk/clerk-react";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { useStudy } from "@/contexts/StudyContext";
import { LogoIcon } from "@/components/LogoIcon";
import { OnboardingTour } from "@/components/OnboardingTour";
import { syncWithSupabase, readLastSync, writeLastSync } from "@/lib/db";
import { processPendingOperations } from "@/services/queueService";
import { useErrors } from '@/contexts/ErrorContext';
import { Toaster } from "@/components/ui/sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-8 w-8 text-primary" />
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-foreground/70">Carregando...</p>
        <p className="mt-1 text-xs text-foreground/40">Preparando seus dados</p>
      </div>
    </div>
  );
}

// ROTAS DIVIDIDAS PARA O MOBILE
const MAIN_ROTAS = [
  { to: "/", label: "Início", icon: "home" },
  { to: "/conteudo", label: "Conteúdo", icon: "book" },
  { to: "/calendario", label: "Calendário", icon: "calendar" },
  { to: "/sessoes", label: "Sessões", icon: "timer" },
] as const;

const MAIS_ROTAS = [
  { to: "/erros", label: "Erros", icon: "alert" },
  { to: "/flashcards", label: "Flashcards", icon: "layers" },
  { to: "/simulados", label: "Simulados", icon: "file-text" },
    { to: "/amigas", label: "Amigas", icon: "users" },
  { to: "/configuracoes", label: "Ajustes", icon: "settings" },
] as const;

const TODAS_ROTAS = [...MAIN_ROTAS, ...MAIS_ROTAS];

const ICONS = {
  home: Home,
  book: BookOpen,
  calendar: Calendar,
  timer: Timer,
  alert: AlertTriangle,
  layers: Layers,
  "file-text": FileText,
  settings: Settings,
  users: Users,
} as const;

type RouteIcon = keyof typeof ICONS;

export function AppShell(props: {
  children: ReactNode;
  title?: string;
  breadcrumb?: string;
}) {
  return (
    <>
      <AppShellInner {...props} />
      <Toaster position="top-right" closeButton theme="dark" />
    </>
  );
}

function AppShellInner({
  children,
  title,
  breadcrumb,
}: {
  children: ReactNode;
  title?: string;
  breadcrumb?: string;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const { user, isLoaded } = useAppUser();
  const { loading: flashcardsLoading, refreshFlashcards } = useFlashcardContext();
  const { refresh: refreshErrors } = useErrors();
  const { records: studyRecords, refresh: refreshStudy } = useStudy();

  const [profileName, setProfileName] = useState<string>("Usuário");
  const [avatarFromSupabase, setAvatarFromSupabase] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;
      try {
        const supabaseClient = await getSupabaseWithToken();
        const { data } = await supabaseClient
          .from('profiles')
          .select('name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        if (data?.name) setProfileName(data.name);
        if (data?.avatar_url) setAvatarFromSupabase(data.avatar_url);
      } catch (error) {
        console.warn('Erro ao carregar perfil no AppShell:', error);
        const fallbackName = user?.fullName || user?.username || "Usuário";
        setProfileName(fallbackName);
      }
    };
    if (isLoaded) {
      loadProfile();
    }
  }, [user, isLoaded]);

  useEffect(() => {
    if (!studyRecords || studyRecords.length === 0) {
      setStreak(0);
      return;
    }
    const datas = [...new Set(studyRecords.map(r => r.date))].sort();
    if (datas.length === 0) {
      setStreak(0);
      return;
    }
    const hoje = new Date().toISOString().split('T')[0];
    let streakCount = 0;
    let dataAtual = hoje;
    for (let i = datas.length - 1; i >= 0; i--) {
      if (datas[i] === dataAtual) {
        streakCount++;
        const dataAnterior = new Date(dataAtual);
        dataAnterior.setDate(dataAnterior.getDate() - 1);
        dataAtual = dataAnterior.toISOString().split('T')[0];
      } else {
        break;
      }
    }
    setStreak(streakCount);
  }, [studyRecords]);

  useEffect(() => {
    if (!user?.id) return;
    const syncTime = readLastSync(user.id);
    if (syncTime && syncTime !== '1970-01-01T00:00:00Z') {
      const date = new Date(syncTime);
      setLastSyncTime(date.toLocaleTimeString());
    } else {
      setLastSyncTime(null);
    }
  }, [user?.id]);

  const performSync = useCallback(async (showFeedback: boolean = false) => {
    const userId = user?.id;
    if (!userId) return;
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      await processPendingOperations();
      await syncWithSupabase(userId);
      refreshFlashcards();
      refreshErrors();
      refreshStudy();
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString());
      writeLastSync(userId, now.toISOString());
      if (showFeedback) toast.success('Sincronização concluída');
    } catch (error) {
      console.error('❌ [AppShell] Erro na sincronização:', error);
      if (showFeedback) toast.error('Falha ao sincronizar');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshFlashcards, refreshErrors, refreshStudy, toast, user?.id]);

  useEffect(() => {
    if (!isLoaded || flashcardsLoading) return;
    const initialSync = setTimeout(() => { performSync(); }, 2000);
    return () => clearTimeout(initialSync);
  }, [isLoaded, flashcardsLoading]);

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: "Sair da conta?",
      description: "Você será redirecionado para a tela de login.",
      confirmText: "Sair",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (ok) {
      try {
        await signOut();
        localStorage.removeItem('revisaflash_user_id');
        navigate('/login');
      } catch (error) {
        localStorage.removeItem('revisaflash_user_id');
        window.location.href = '/login';
      }
    }
  };

  if (!isLoaded || flashcardsLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--sidebar)' }}>
      <OnboardingTour />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col lg:flex" style={{ backgroundColor: 'var(--sidebar)' }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoIcon size={40} />
          <div>
            <div className="font-display text-base font-bold tracking-tight text-white">
              Revisa<span className="text-primary">Flash</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">ENARE 2026</div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">Principal</div>
          {TODAS_ROTAS.map((r) => (
            <NavItem key={r.to} to={r.to} label={r.label} iconKey={r.icon as RouteIcon} active={pathname === r.to} />
          ))}
        </nav>

        <div className="space-y-3 p-3">
          {streak > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs">
              <Flame className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-white">{streak} dias</span>
              <span className="text-white/60">de sequência</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-white/50">
            <RefreshCw className="h-3 w-3" />
            {lastSyncTime ? `Sincronizado às ${lastSyncTime}` : "Nunca sincronizado"}
          </div>
          <div className="flex items-center gap-3 rounded-full bg-white/5 p-2">
            {avatarFromSupabase ? (
              <img src={avatarFromSupabase} alt={profileName} className="h-9 w-9 rounded-full object-cover border border-white/20" />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
                {profileName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">{profileName}</div>
              <div className="truncate text-[10px] text-white/50">Estudante</div>
            </div>
            <button onClick={handleLogout} className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white transition-colors" aria-label="Sair">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <div className="p-2 lg:p-3" style={{ backgroundColor: 'var(--sidebar)' }}>
          <div
            className="flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--background)',
              borderRadius: '1.75rem',
              boxShadow: '0 6px 0 0 var(--accent)',
              minHeight: 'calc(100vh - 16px)',
            }}
          >
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Link to="/" className="flex items-center gap-2 lg:hidden">
                  <LogoIcon size={32} />
                  <span className="font-display text-sm font-semibold">RevisaFlash</span>
                </Link>
                <div className="hidden items-center gap-2 text-xs lg:flex">
                  <span className="text-foreground/40">RevisaFlash</span>
                  {breadcrumb && (
                    <>
                      <ChevronRight className="h-3 w-3 text-foreground/30" />
                      <span className="text-foreground/70">{breadcrumb}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => performSync(true)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground/60 hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Sincronizar</span>
                </button>

                {streak > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary rf-pulse" />
                    <span className="text-xs font-medium text-primary">{streak}d</span>
                  </div>
                )}
              </div>
            </header>

            {/* Adicionado overflow-x-hidden para evitar que o conteúdo estoure a tela no mobile */}
            <main className="rf-fade-in mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
              {title && (
                <div id={`${breadcrumb?.toLowerCase() || 'page'}-header`} className="mb-6 flex flex-col gap-1">
                  {breadcrumb && <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">{breadcrumb}</span>}
                  <h1 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
                </div>
              )}
              {children}
            </main>
          </div>
        </div>
      </div>

      <BottomNav pathname={pathname} />
    </div>
  );
}

function NavItem({ to, label, iconKey, active }: { to: string; label: string; iconKey: RouteIcon; active: boolean; }) {
  const Icon = ICONS[iconKey];
  return (
    <Link
      to={to}
      className={[
        "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-[#1a0512] text-primary" : "text-white/80 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

// NOVO MENU INFERIOR (MOBILE)
function BottomNav({ pathname }: { pathname: string }) {
  const [isMaisOpen, setIsMaisOpen] = useState(false);

  // Fecha a gaveta quando muda de página
  useEffect(() => {
    setIsMaisOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
        <div
          className="mx-auto flex w-full max-w-md items-center justify-around gap-1 rounded-3xl px-2 py-2"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--sidebar) 92%, transparent)',
            border: '1px solid color-mix(in oklab, var(--foreground) 12%, transparent)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 12px 32px -12px rgba(0,0,0,0.6)',
          }}
        >
          {MAIN_ROTAS.map((r) => {
            const Icon = ICONS[r.icon as RouteIcon];
            const active = pathname === r.to;
            return (
              <Link
                key={r.to}
                to={r.to}
                className={[
                  "flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors",
                  active ? "text-primary" : "text-foreground/55 hover:text-foreground/80",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                <span className={["text-[10px] leading-tight truncate", active ? "font-bold" : "font-medium"].join(" ")}>
                  {r.label}
                </span>
              </Link>
            );
          })}
          
          {/* Botão "Mais" */}
          <button
            onClick={() => setIsMaisOpen(true)}
            className={[
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors",
              isMaisOpen ? "text-primary" : "text-foreground/55 hover:text-foreground/80",
            ].join(" ")}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] leading-tight truncate font-medium">Mais</span>
          </button>
        </div>
      </nav>

      {/* GAVETA DE BAIXO PARA CIMA (Bottom Sheet) */}
      {isMaisOpen && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMaisOpen(false)}
        >
          <div 
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-surface p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold">Mais opções</h3>
              <button onClick={() => setIsMaisOpen(false)} className="p-2 bg-muted rounded-full">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {MAIS_ROTAS.map((r) => {
                const Icon = ICONS[r.icon as RouteIcon];
                const active = pathname === r.to;
                return (
                  <Link
                    key={r.to}
                    to={r.to}
                    className={[
                      "flex items-center gap-3 rounded-2xl border border-border p-4 transition-colors",
                      active ? "bg-primary/10 border-primary/30 text-primary" : "bg-background text-foreground/80 hover:bg-muted",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-semibold">{r.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}