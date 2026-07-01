import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "../contexts/ThemeContext";
import { FlashcardProvider } from "../contexts/FlashcardContext";
import { StudyProvider } from "../contexts/StudyContext";
import { ErrorProvider } from "../contexts/ErrorContext";
import { supabase } from "../lib/supabaseClient";

// ============================================================
// COMPONENTE 404
// ============================================================
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">RevisaFlash</p>
        <h1 className="mt-3 font-display text-6xl font-semibold text-foreground">404</h1>
        <h2 className="mt-2 text-lg font-medium text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A rota que você tentou abrir não existe neste protótipo visual.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE DE ERRO
// ============================================================
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente recarregar ou voltar para o início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROOT COMPONENT
// ============================================================
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const loggedIn = !!session;
      const currentPath = window.location.pathname;

      if (!loggedIn && currentPath !== '/login') {
        navigate({ to: '/login' });
      } else if (loggedIn && currentPath === '/login') {
        navigate({ to: '/' });
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const loggedIn = !!session;
      const currentPath = window.location.pathname;

      if (!loggedIn && currentPath !== '/login') {
        navigate({ to: '/login' });
      } else if (loggedIn && currentPath === '/login') {
        navigate({ to: '/' });
      }
    });

    return () => subscription?.unsubscribe();
  }, [navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FlashcardProvider>
          <StudyProvider>
            <ErrorProvider>
              <Outlet />
            </ErrorProvider>
          </StudyProvider>
        </FlashcardProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// ============================================================
// ROUTE DEFINITION (sem SSR)
// ============================================================
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RevisaFlash — Estudo para ENARE" },
      { name: "description", content: "Protótipo visual do RevisaFlash: revisão espaçada, flashcards, banco de erros e desempenho para o ENARE de Odontologia." },
      { name: "theme-color", content: "#0F1A1F" },
      { property: "og:title", content: "RevisaFlash" },
      { property: "og:description", content: "Estudo focado para o ENARE de Odontologia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      // Fontes e CSS
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },

      // Ícones do PWA (já no manifest, mas redundante para iOS)
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },

      // ============================================================
      // SPLASH SCREENS PARA IPHONE (iOS)
      // ============================================================
      // iPhone 12 Pro Max, 13 Pro Max, 14 Pro Max (1284x2778)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-1284x2778.png",
        media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone X, XS, 11 Pro, 12, 13, 14 (1125x2436)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-1125x2436.png",
        media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 8 Plus, 7 Plus, 6s Plus (1242x2208)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-1242x2208.png",
        media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 8, 7, 6s, SE (750x1334)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-750x1334.png",
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPhone XR, 11 (828x1792)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-828x1792.png",
        media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPhone 5, 5s, SE 1ª geração (640x1136)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-640x1136.png",
        media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPads (opcional, mas incluído)
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-1536x2048.png",
        media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-1668x2224.png",
        media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash/splash-2048x2732.png",
        media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});