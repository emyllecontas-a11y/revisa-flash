import { useState, useEffect } from 'react';
import { Joyride } from 'react-joyride';
import type { Step } from 'react-joyride';
import { useAppUser } from '@/contexts/UserContext';
import { useNavigate, useLocation } from 'react-router-dom';

// ============================================================
// DEFINIÇÃO DOS PASSOS DO TOUR
// ============================================================
const STEPS: Step[] = [
  // ... (seus steps, não vou repetir para não alongar)
];

const STEP_TO_NEXT_ROUTE: Record<number, string> = {
  4: '/conteudo',
  5: '/calendario',
  6: '/erros',
  7: '/flashcards',
  8: '/desempenho',
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export function OnboardingTour() {
  const { user, isLoaded } = useAppUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const userId = user.id;
    const storageKey = `tour_completed_${userId}`;
    const hasCompleted = localStorage.getItem(storageKey);

    console.log(`[Tour] userId: ${userId}, hasCompleted: ${hasCompleted}`);

    if (!hasCompleted) {
      console.log('[Tour] Iniciando tour pela primeira vez.');
      setRun(true);
    } else {
      console.log('[Tour] Tour já concluído. Não iniciar.');
    }
  }, [user, isLoaded]);

  const handleJoyrideCallback = (data: any) => {
    const { status, type, index } = data;

    // Se terminou ou pulou, MARCA COMO CONCLUÍDO
    if (['finished', 'skipped'].includes(status) || type === 'tour:end') {
      setRun(false);
      if (user?.id) {
        const storageKey = `tour_completed_${user.id}`;
        localStorage.setItem(storageKey, 'true');
        console.log(`[Tour] Concluído/pulado. Salvando flag: ${storageKey}`);
      }
      return;
    }

    // Navegação entre passos
    if (type === 'step:after') {
      const currentStepIndex = index;
      const nextRoute = STEP_TO_NEXT_ROUTE[currentStepIndex];
      const currentPath = location.pathname;

      if (nextRoute && nextRoute !== currentPath && !isNavigating) {
        setIsNavigating(true);
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
      showSkipButton={true}        // ✅ Botão "Pular" visível
      showProgress={true}
      disableOverlayClose={false}  // ✅ Permite fechar clicando fora (opcional)
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
          fontWeight: 500,
          // 🔥 Vamos estilizar o botão "Pular" para ficar bem visível
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '6px 12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(255,255,255,0.05)',
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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
      }}
      callback={handleJoyrideCallback}
    />
  );
}