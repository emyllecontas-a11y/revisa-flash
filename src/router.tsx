import { createBrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';

// Importa as páginas
import Cadastro from './routes/cadastro';
import Login from './routes/login';
import Index from './routes/index';
import Flashcards from './routes/flashcards';
import Erros from './routes/erros';
// import Desempenho from './routes/desempenho'; // 🔥 REMOVIDO
import Conteudo from './routes/conteudo';
import Configuracoes from './routes/configuracoes';
import Calendario from './routes/calendario';
import LandingPage from './routes/landing';
// 🔥 IMPORTAÇÕES DE SIMULADOS
import Simulados from './routes/simulados';
import SimuladoPlayer from './routes/simulados.$id';
// 🔥 IMPORTAÇÃO DE LISTAS
import ListaPlayer from './routes/listas.$id';
// 🔥 REMOVIDO: import Estatisticas from './routes/estatisticas';

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
    path: '/cadastro/*',
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
  // 🔥 ROTA /desempenho REMOVIDA
  // {
  //   path: '/desempenho',
  //   element: (
  //     <ClerkProtectedRoute>
  //       <Desempenho />
  //     </ClerkProtectedRoute>
  //   ),
  // },
  // 🔥 ROTAS DE SIMULADOS
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
  // 🔥 ROTA DE LISTAS (player)
  {
    path: '/listas/:id',
    element: (
      <ClerkProtectedRoute>
        <ListaPlayer />
      </ClerkProtectedRoute>
    ),
  },
  // 🔥 ROTA /estatisticas REMOVIDA (agora é modal)
  // {
  //   path: '/estatisticas',
  //   element: (
  //     <ClerkProtectedRoute>
  //       <Estatisticas />
  //     </ClerkProtectedRoute>
  //   ),
  // },
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
  // A rota /flash-ia foi removida
  {
    path: '*',
    element: <ClerkCatchAll />,
  },
]);