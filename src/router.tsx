import { createBrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';

// Importa as páginas
import Login from './routes/login';
import Index from './routes/index';
import Flashcards from './routes/flashcards';
import Erros from './routes/erros';
import Desempenho from './routes/desempenho';
import Conteudo from './routes/conteudo';
import Configuracoes from './routes/configuracoes';
import Calendario from './routes/calendario';

// Importa o componente de proteção
import { ProtectedRoute } from './components/ProtectedRoute';

export const queryClient = new QueryClient();

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Index />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/flashcards',
    element: (
      <ProtectedRoute>
        <Flashcards />
      </ProtectedRoute>
    ),
  },
  {
    path: '/erros',
    element: (
      <ProtectedRoute>
        <Erros />
      </ProtectedRoute>
    ),
  },
  {
    path: '/desempenho',
    element: (
      <ProtectedRoute>
        <Desempenho />
      </ProtectedRoute>
    ),
  },
  {
    path: '/conteudo',
    element: (
      <ProtectedRoute>
        <Conteudo />
      </ProtectedRoute>
    ),
  },
  {
    path: '/configuracoes',
    element: (
      <ProtectedRoute>
        <Configuracoes />
      </ProtectedRoute>
    ),
  },
  {
    path: '/calendario',
    element: (
      <ProtectedRoute>
        <Calendario />
      </ProtectedRoute>
    ),
  },
]);