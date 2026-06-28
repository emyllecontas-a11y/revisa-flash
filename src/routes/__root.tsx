import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
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
// ROOT SHELL
// ============================================================
function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// ============================================================
// ROOT COMPONENT
// ============================================================
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate(); // <-- NOVO: hook de navegação

  // Verificar autenticação e redirecionar
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const loggedIn = !!session;
      const currentPath = window.location.pathname;

      if (!loggedIn && currentPath !== '/login') {
        navigate({ to: '/login' }); // <-- SUBSTITUÍDO
      } else if (loggedIn && currentPath === '/login') {
        navigate({ to: '/' }); // <-- SUBSTITUÍDO
      }
    };

    checkAuth();

    // Escutar mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const loggedIn = !!session;
      const currentPath = window.location.pathname;

      if (!loggedIn && currentPath !== '/login') {
        navigate({ to: '/login' }); // <-- SUBSTITUÍDO
      } else if (loggedIn && currentPath === '/login') {
        navigate({ to: '/' }); // <-- SUBSTITUÍDO
      }
    });

    return () => subscription?.unsubscribe();
  }, [navigate]); // <-- ADICIONADO navigate como dependência

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
// ROUTE DEFINITION
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
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});