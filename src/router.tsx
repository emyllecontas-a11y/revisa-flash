import { createBrowserRouter, Navigate } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { AuthenticateWithRedirectCallback, SignIn } from '@clerk/clerk-react';

// Importa as páginas
import Cadastro from './routes/cadastro';
import Login from './routes/login';
import Index from './routes/index';
import Flashcards from './routes/flashcards';
import Erros from './routes/erros';
import Conteudo from './routes/conteudo';
import Configuracoes from './routes/configuracoes';
import Calendario from './routes/calendario';
import LandingPage from './routes/landing';
import Simulados from './routes/simulados';
import SimuladoPlayer from './routes/simulados.$id';
import ListaPlayer from './routes/listas.$id';
import TestePdf from './routes/teste-pdf';
import PdfPage from './routes/pdf.$fileId';
import Sessoes from './routes/sessoes';
// 🔥 NOVA: tela única que junta "Compartilhado comigo" + "Amizades"
import Comunidade from './routes/comunidade';

import { ClerkProtectedRoute } from './components/ClerkProtectedRoute';

function ClerkCatchAll() {
  return null;
}

export const queryClient = new QueryClient();

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ClerkProtectedRoute>
        <Index />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/login/*',
    element: <Login />,
  },
  {
    path: '/cadastro/*',
    element: <Cadastro />,
  },
  {
    path: '/sso-callback',
    element: <AuthenticateWithRedirectCallback />,
  },
  {
    path: '/reset-senha/*',
    element: (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md">
          <SignIn
            routing="path"
            path="/reset-senha"
            signUpUrl="/cadastro"
            appearance={{
              variables: {
                colorPrimary: '#FE7802',
                colorBackground: '#290E1F',
                colorText: '#FFFFFF',
                colorTextSecondary: '#C0C0D0',
                borderRadius: '0.75rem',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              },
              elements: {
                card: 'background: #38192B; border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 2rem; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);',
                formButtonPrimary: 'background: #FE7802; color: #FFFFFF; font-weight: 600; padding: 0.625rem; width: 100%; border-radius: 9999px; transition: all 0.2s; border: none; cursor: pointer; font-size: 0.875rem;',
                formFieldInput: 'background: #290E1F; border: 1px solid #503243; padding: 0.625rem; border-radius: 9999px; color: #FFFFFF !important; width: 100%; outline: none; transition: all 0.2s; font-size: 0.875rem;',
                formFieldLabel: 'color: #FFFFFF !important; font-size: 0.875rem; font-weight: 500; display: block; margin-bottom: 0.25rem;',
                footerActionLink: 'color: #FE7802 !important; text-decoration: underline; font-weight: 500; font-size: 0.875rem;',
                dividerLine: 'background: #503243; height: 1px;',
                dividerText: 'color: #BCA7B4; font-size: 0.75rem; padding: 0 0.5rem;',
              },
            }}
          />
        </div>
      </div>
    ),
  },
  {
    path: '/landing',
    element: <LandingPage />,
  },
  {
    path: '/flashcards',
    element: (
      <ClerkProtectedRoute>
        <Flashcards />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/erros',
    element: (
      <ClerkProtectedRoute>
        <Erros />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/simulados',
    element: (
      <ClerkProtectedRoute>
        <Simulados />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/simulados/:id',
    element: (
      <ClerkProtectedRoute>
        <SimuladoPlayer />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/listas/:id',
    element: (
      <ClerkProtectedRoute>
        <ListaPlayer />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/conteudo',
    element: (
      <ClerkProtectedRoute>
        <Conteudo />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/configuracoes',
    element: (
      <ClerkProtectedRoute>
        <Configuracoes />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/calendario',
    element: (
      <ClerkProtectedRoute>
        <Calendario />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/sessoes',
    element: (
      <ClerkProtectedRoute>
        <Sessoes />
      </ClerkProtectedRoute>
    ),
  },
  // 🔥 NOVA ROTA UNIFICADA
  {
    path: '/comunidade',
    element: (
      <ClerkProtectedRoute>
        <Comunidade />
      </ClerkProtectedRoute>
    ),
  },
  // 🔥 Redirecionamentos das rotas antigas (mantém links funcionando)
  {
    path: '/compartilhados',
    element: <Navigate to="/comunidade?tab=compartilhado" replace />,
  },
  {
    path: '/amigas',
    element: <Navigate to="/comunidade?tab=amizades" replace />,
  },
  {
    path: '/teste-pdf',
    element: (
      <ClerkProtectedRoute>
        <TestePdf />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '/pdf/:fileId',
    element: (
      <ClerkProtectedRoute>
        <PdfPage />
      </ClerkProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <ClerkCatchAll />,
  },
]);