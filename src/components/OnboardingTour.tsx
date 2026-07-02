import { useState, useEffect } from 'react';
import { Joyride } from 'react-joyride';
import type { Step } from 'react-joyride';
import { useUser } from '@clerk/clerk-react';
import { useNavigate, useLocation } from 'react-router-dom';

// ============================================================
// DEFINIÇÃO DOS PASSOS DO TOUR
// ============================================================
const STEPS: Step[] = [
  {
    target: '#dashboard-stats',
    title: '📊 Seu progresso em números',
    content: 'Aqui você vê seu streak, flashcards devidos hoje, erros ativos e a contagem regressiva para a prova.',
    placement: 'bottom',
  },
  {
    target: '#dashboard-checklist',
    title: '📋 Checklist diário',
    content: 'Crie e gerencie sua lista de tarefas do dia. Marque cada item como concluído e acompanhe seu progresso.',
    placement: 'right',
  },
  {
    target: '#dashboard-flashcards',
    title: '📝 Flashcards com FSRS',
    content: 'Veja os flashcards que você precisa revisar hoje. O algoritmo FSRS decide quando cada card deve aparecer.',
    placement: 'top',
  },
  {
    target: '#dashboard-progress',
    title: '📈 Progresso por disciplina',
    content: 'Acompanhe o quanto você já avançou em cada disciplina do seu plano de estudos.',
    placement: 'top',
  },
  {
    target: '#dashboard-reviews',
    title: '📅 Próximas revisões',
    content: 'Revisões agendadas para os próximos dias. O sistema agenda automaticamente em 1, 7, 15, 30 e 60 dias.',
    placement: 'left',
  },
  {
    target: '#conteudo-header',
    title: '📚 Plano de estudos',
    content: 'Aqui você estrutura disciplinas e tópicos. Crie seu plano de estudos e acompanhe o progresso de cada matéria.',
    placement: 'bottom',
  },
  {
    target: '#calendario-header',
    title: '📅 Calendário de revisões',
    content: 'Visualize todas as suas revisões agendadas no calendário. Veja os dias que você tem revisões programadas.',
    placement: 'bottom',
  },
  {
    target: '#erros-header',
    title: '❌ Banco de erros',
    content: 'Registre os erros que você cometeu. O app gera automaticamente flashcards para cada erro, ajudando você a revisar.',
    placement: 'bottom',
  },
  {
    target: '#flashcards-header',
    title: '📝 Flashcards',
    content: 'Aqui você estuda seus flashcards com repetição espaçada. Avalie cada card como Errei, Difícil, Bom ou Fácil.',
    placement: 'bottom',
  },
  {
    target: '#desempenho-header',
    title: '📈 Desempenho e estatísticas',
    content: 'Veja gráficos, heatmaps e evolução dos seus acertos. Identifique áreas que precisam de mais atenção.',
    placement: 'bottom',
  },
];

// Mapeamento: passo atual → rota para O PRÓXIMO passo
const STEP_TO_NEXT_ROUTE: Record<number, string> = {
  4: '/conteudo',   // após o passo 4, vai para conteúdo
  5: '/calendario', // após passo 5, vai para calendário
  6: '/erros',      // após passo 6, vai para erros
  7: '/flashcards', // após passo 7, vai para flashcards
  8: '/desempenho', // após passo 8, vai para desempenho
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export function OnboardingTour() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Inicia o tour no primeiro acesso
  useEffect(() => {
    if (!isLoaded || !user) return;

    const hasCompleted = localStorage.getItem(`tour_completed_${user.id}`);
    const createdAt = user.createdAt ? new Date(user.createdAt) : null;
    const isFirstLogin = createdAt && (Date.now() - createdAt.getTime() < 5 * 60 * 1000);

    if (isFirstLogin && !hasCompleted) {
      setRun(true);
    }
  }, [user, isLoaded]);

  const handleJoyrideCallback = (data: any) => {
    const { status, type, index } = data;

    // Se terminou ou pulou
    if (['finished', 'skipped'].includes(status) || type === 'tour:end') {
      setRun(false);
      if (user?.id) {
        localStorage.setItem(`tour_completed_${user.id}`, 'true');
      }
      return;
    }

    // Quando o usuário clica em "Próximo" e o passo muda
    if (type === 'step:after') {
      // O índice atual é o passo que acabou de ser exibido (já avançou)
      const currentStepIndex = index;
      
      // Verifica se este passo tem uma rota para o próximo
      const nextRoute = STEP_TO_NEXT_ROUTE[currentStepIndex];
      const currentPath = location.pathname;

      if (nextRoute && nextRoute !== currentPath && !isNavigating) {
        setIsNavigating(true);
        // Navega para a próxima página após um pequeno delay
        setTimeout(() => {
          navigate(nextRoute);
          setIsNavigating(false);
        }, 400);
      }
    }
  };

  if (!isLoaded || !user) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous={true}
      showSkipButton={true}
      showProgress={true}
      disableOverlayClose={true}
      floaterProps={{
        options: {
          zIndex: 1000,
        },
      }}
      styles={{
        options: {
          primaryColor: '#14B8A6',
          textColor: '#ECFEFF',
          zIndex: 1000,
          overlayColor: 'rgba(0,0,0,0.7)',
        },
        tooltip: {
          backgroundColor: '#0E2A2C',
          borderRadius: '12px',
          border: '1px solid rgba(236, 254, 255, 0.08)',
          padding: '20px',
          maxWidth: '400px',
          color: '#ECFEFF',
          fontFamily: 'DM Sans, ui-sans-serif, system-ui, sans-serif',
        },
        tooltipTitle: {
          color: '#14B8A6',
          fontFamily: 'Space Grotesk, ui-sans-serif, system-ui, sans-serif',
          fontSize: '18px',
          fontWeight: 600,
        },
        tooltipContent: {
          fontSize: '14px',
          lineHeight: '1.6',
        },
        buttonNext: {
          backgroundColor: '#14B8A6',
          borderRadius: '8px',
          color: '#04201D',
          fontWeight: 600,
          fontSize: '13px',
          padding: '8px 20px',
        },
        buttonBack: {
          color: '#8A86A8',
          fontSize: '13px',
        },
        buttonSkip: {
          color: '#8A86A8',
          fontSize: '13px',
        },
        buttonClose: {
          color: '#8A86A8',
        },
        beacon: {
          color: '#14B8A6',
          backgroundColor: 'rgba(20, 184, 166, 0.3)',
        },
        tooltipFooter: {
          marginTop: '16px',
        },
      }}
      callback={handleJoyrideCallback}
    />
  );
}