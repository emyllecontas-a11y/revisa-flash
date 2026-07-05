import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Home, BookOpen, Calendar, AlertTriangle, Layers, BarChart3, Settings,
  Flame, LogOut, ChevronRight, User, Zap
} from "lucide-react";
import type { ReactNode } from "react";
import { useAppUser } from "@/contexts/UserContext";
import { useFlashcardContext } from "@/contexts/FlashcardContext";
import { getSupabaseWithToken } from "@/lib/supabaseClient";
import { useStudy } from "@/contexts/StudyContext";
import { LogoIcon } from "@/components/LogoIcon";
import { OnboardingTour } from "@/components/OnboardingTour";

// ============================================================
// COMPONENTE DE LOADING (estilo raio)
// ============================================================
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

// ============================================================
// ROTAS
// ============================================================
const ROTAS = [
  { to: "/", label: "Início", icon: "home" },
  { to: "/conteudo", label: "Conteúdo", icon: "book" },
  { to: "/calendario", label: "Calendário", icon: "calendar" },
  { to: "/erros", label: "Erros", icon: "alert" },
  { to: "/flashcards", label: "Flashcards", icon: "layers" },
  { to: "/desempenho", label: "Desempenho", icon: "chart" },
  { to: "/configuracoes", label: "Ajustes", icon: "settings" },
] as const;

const ICONS = {
  home: Home,
  book: BookOpen,
  calendar: Calendar,
  alert: AlertTriangle,
  layers: Layers,
  chart: BarChart3,
  settings: Settings,
} as const;

type RouteIcon = keyof typeof ICONS;

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export function AppShell({
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

  // ============================================================
  // 🔥 TODOS OS HOOKS DEVEM VIR ANTES DE QUALQUER EARLY RETURN
  // ============================================================

  // Contextos
  const { user, isSignedIn, isLoaded } = useAppUser();
  const { loading: flashcardsLoading } = useFlashcardContext();
  const studyContext = useStudy();
  const { records: studyRecords } = studyContext;

  // Estados
  const [profileName, setProfileName] = useState<string>("Usuário");
  const [avatarFromSupabase, setAvatarFromSupabase] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  // ============================================================
  // 🔥 EFFECTS (TAMBÉM DEVEM VIR ANTES DO EARLY RETURN)
  // ============================================================

  // Carrega perfil do Supabase
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

  // Calcula streak
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

  // ============================================================
  // 🔥 EARLY RETURN (AGORA DEPOIS DE TODOS OS HOOKS)
  // ============================================================

  // Se ainda está carregando, mostra tela de loading
  if (!isLoaded || flashcardsLoading) {
    return <LoadingScreen />;
  }

  // ============================================================
  // HANDLE LOGOUT
  // ============================================================
  const handleLogout = async () => {
    if (confirm("Deseja realmente sair?")) {
      localStorage.removeItem('revisaflash_user_id');
      navigate('/login');
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-background text-foreground">
      <OnboardingTour />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <LogoIcon className="h-10 w-10" size={40} />
          <div>
            <div className="font-display text-base font-semibold tracking-tight">RevisaFlash</div>
            <div className="text-[10px] uppercase tracking-widest text-foreground/40">ENARE 2026</div>
          </div>
        </div>

        <nav className="mt-5 flex-1 space-y-0.5 px-3">
          <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/30">Principal</div>
          {ROTAS.map((r) => (
            <NavItem
              key={r.to}
              to={r.to}
              label={r.label}
              iconKey={r.icon as RouteIcon}
              active={pathname === r.to}
            />
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
            {avatarFromSupabase ? (
              <img
                src={avatarFromSupabase}
                alt={profileName}
                className="h-9 w-9 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 font-display text-xs font-semibold text-accent">
                {profileName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{profileName}</div>
              <div className="truncate text-[10px] text-foreground/40">Estudante</div>
            </div>
            <button
              onClick={handleLogout}
              className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-white/5 hover:text-foreground transition-colors"
              aria-label="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <LogoIcon className="h-8 w-8" size={32} />
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
            <div className="hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 sm:flex">
              <span className="text-[10px] font-medium uppercase tracking-widest text-foreground/40">Prova</span>
              <span className="text-xs font-medium text-foreground">13 set 2026</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                {diasAteProva()}d
              </span>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary rf-pulse" />
                <span className="text-xs font-medium text-primary">{streak}d</span>
              </div>
            )}
          </div>
        </header>

        <main className="rf-fade-in mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {title && (
            <div id={`${breadcrumb?.toLowerCase() || 'page'}-header`} className="mb-6 flex flex-col gap-1">
              {breadcrumb && <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">{breadcrumb}</span>}
              <h1 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
            </div>
          )}
          {children}
        </main>
      </div>

      <BottomNav pathname={pathname} />
    </div>
  );
}

// ============================================================
// NAV ITEM
// ============================================================
function NavItem({
  to,
  label,
  iconKey,
  active,
}: {
  to: string;
  label: string;
  iconKey: RouteIcon;
  active: boolean;
}) {
  const Icon = ICONS[iconKey];
  return (
    <Link
      to={to}
      className={[
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground/60 hover:bg-white/5 hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

// ============================================================
// BOTTOM NAV (MOBILE)
// ============================================================
function BottomNav({ pathname }: { pathname: string }) {
  const items = ROTAS;

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
      <div className="mx-auto flex max-w-sm items-center justify-between rounded-2xl border border-white/10 bg-surface/85 px-1 py-1.5 backdrop-blur-xl shadow-elevated overflow-x-auto">
        {items.map((r) => {
          const Icon = ICONS[r.icon as RouteIcon];
          const active = pathname === r.to;
          return (
            <Link
              key={r.to}
              to={r.to}
              className={[
                "flex flex-col items-center gap-0 rounded-md px-1.5 py-1 transition-colors min-w-[40px]",
                active ? "text-primary" : "text-foreground/45",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-tight">{r.label}</span>
              <span
                className={[
                  "h-0.5 w-3 rounded-full transition-colors",
                  active ? "bg-primary" : "bg-transparent",
                ].join(" ")}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ============================================================
// FUNÇÃO AUXILIAR: DIAS ATÉ A PROVA
// ============================================================
function diasAteProva(): number {
  const dataProva = new Date(2026, 8, 13);
  const hoje = new Date();
  const diff = Math.ceil((dataProva.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}