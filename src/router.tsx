import { createBrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';

// Importe todas as páginas (cada uma está em src/routes/)
import Index from './routes/index';
import Login from './routes/login';
import Flashcards from './routes/flashcards';
import Erros from './routes/erros';
import Desempenho from './routes/desempenho';
import Conteudo from './routes/conteudo';
import Configuracoes from './routes/configuracoes';
import Calendario from './routes/calendario';

// Cria o cliente do React Query (igual antes)
export const queryClient = new QueryClient();

// Cria o roteador com todas as rotas
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Index />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/flashcards',
    element: <Flashcards />,
  },
  {
    path: '/erros',
    element: <Erros />,
  },
  {
    path: '/desempenho',
    element: <Desempenho />,
  },
  {
    path: '/conteudo',
    element: <Conteudo />,
  },
  {
    path: '/configuracoes',
    element: <Configuracoes />,
  },
  {
    path: '/calendario',
    element: <Calendario />,
  },
]);