import { createBrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';

// Importa as páginas
import Cadastro from './routes/cadastro';
import Login from './routes/login';
import Index from './routes/index';
import Flashcards from './routes/flashcards';
import Erros from './routes/erros';
import Desempenho from './routes/desempenho';
import Conteudo from './routes/conteudo';
import Configuracoes from './routes/configuracoes';
import Calendario from './routes/calendario';
import LandingPage from './routes/landing';

// Importa o componente de proteção
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
    path: '/cadastro',
    element: <Cadastro />,
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
    path: '/desempenho',
    element: (
      <ClerkProtectedRoute>
        <Desempenho />
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
    path: '*',
    element: <ClerkCatchAll />,
  },
]);