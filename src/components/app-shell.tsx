import { Link, useLocation } from "react-router-dom"; // <-- importação do React Router
import { useState, useEffect } from "react";
import {
  Home, BookOpen, Calendar, AlertTriangle, Layers, BarChart3, Settings,
  Flame, LogOut, ChevronRight, User
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useStudy } from "@/contexts/StudyContext";
import { LogoIcon } from "@/components/LogoIcon";

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
  const location = useLocation(); // <-- substitui useRouterState
  const pathname = location.pathname; // <-- obtém o caminho atual
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Usuário");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  const studyContext = useStudy();
  const { records: studyRecords } = studyContext;

  // ============================================================
  // CARREGAR USUÁRIO
  // ============================================================
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, avatar_url')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.name) {
            setUserName(profile.name);
          } else {
            const name = user.user_metadata?.name || user.email?.split('@')[0] || "Usuário";
            setUserName(name);
          }
          if (profile?.avatar_url) {
            setUserAvatar(profile.avatar_url);
          }
        } else {
          const cachedName = localStorage.getItem('revisaflash_user_name');
          if (cachedName) setUserName(cachedName);
        }
      } catch (e) {
        console.warn('Erro ao carregar usuário:', e);
      }
    };
    loadUser();
  }, []);

  // ============================================================
  // CALCULAR STREAK
  // ============================================================
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
  // HANDLE LOGOUT
  // ============================================================
  const handleLogout = async () => {
    if (confirm("Deseja realmente sair?")) {
      localStorage.removeItem('revisaflash_user_id');
      await supabase.auth.signOut();
      window.location.reload();
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar desktop */}
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

        {/* Perfil do usuário */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                className="h-9 w-9 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 font-display text-xs font-semibold text-accent">
                {userName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{userName}</div>
              <div className="truncate text-[10px] text-foreground/40">Estudante</div>
            </div>
            <button
              onClick={handleLogout}
              className="grid h-7 w-7 place-items-center rounded-md text-foreground/40 hover:bg-white/5 hover:text-foreground"
              aria-label="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-[248px]">
        {/* Topbar */}
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

        {/* Page content */}
        <main className="rf-fade-in mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {title && (
            <div className="mb-6 flex flex-col gap-1">
              {breadcrumb && <span className="text-[11px] font-medium uppercase tracking-widest text-foreground/40">{breadcrumb}</span>}
              <h1 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Bottom nav mobile – com todas as rotas */}
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
// BOTTOM NAV (MOBILE) – COM TODAS AS ROTAS
// ============================================================
function BottomNav({ pathname }: { pathname: string }) {
  const items = ROTAS;

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around rounded-2xl border border-white/10 bg-surface/85 px-2 py-2 backdrop-blur-xl shadow-elevated">
        {items.map((r) => {
          const Icon = ICONS[r.icon as RouteIcon];
          const active = pathname === r.to;
          return (
            <Link
              key={r.to}
              to={r.to}
              className={[
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors",
                active ? "text-primary" : "text-foreground/45",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{r.label}</span>
              <span
                className={[
                  "h-0.5 w-4 rounded-full transition-colors",
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