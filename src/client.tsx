import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useUser } from '@clerk/clerk-react';
import { ptBR } from '@clerk/localizations';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { FlashcardProvider } from './contexts/FlashcardContext';
import { StudyProvider } from './contexts/StudyContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { ErrorProvider } from './contexts/ErrorContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { getDb, syncWithSupabase } from './lib/db';
import { supabase } from './lib/supabaseClient';
import { setupQueueListener, processPendingOperations } from '@/services/queueService';
import { LogoIcon } from '@/components/LogoIcon';
import './styles.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('❌ Missing Clerk Publishable Key. Add VITE_CLERK_PUBLISHABLE_KEY to your .env file.');
}

function Root() {
  const { user, isLoaded, isSignedIn } = useUser();
  const userId = user?.id || null;
  const [ready, setReady] = useState(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !isLoaded) return;
    const syncProfile = async () => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) {
          const name = user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Usuário';
          const email = user?.emailAddresses?.[0]?.emailAddress || null;
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              name: name,
              email: email,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          if (insertError) throw insertError;
          console.log('✅ Perfil criado no Supabase para Clerk user:', userId);
        }
      } catch (error) {
        console.error('❌ Erro ao sincronizar perfil com Supabase:', error);
      }
    };
    syncProfile();
  }, [userId, user, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      console.log('⏳ Usuário não autenticado – modo visitante ou login pendente.');
      setReady(true);
      return;
    }
    const initialize = async () => {
      try {
        console.log('🔄 Inicializando RxDB para usuário:', userId);
        userIdRef.current = userId;
        localStorage.setItem('revisaflash_user_id', userId);
        await getDb();
        console.log('✅ Banco local inicializado.');
        setReady(true);
        try {
          await syncWithSupabase(userId);
          console.log('✅ Sincronização RxDB concluída!');
          await processPendingOperations();
          console.log('✅ Fila de operações processada.');
        } catch (syncError) {
          console.warn('⚠️ Sincronização falhou (offline ou erro):', syncError);
        }
      } catch (error) {
        console.error('❌ Erro ao inicializar RxDB:', error);
        setReady(true);
      }
    };
    initialize();
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    const handleOnline = () => {
      console.log('📶 Conexão restaurada, processando fila de operações pendentes...');
      if (userIdRef.current) {
        processPendingOperations().catch(console.error);
      }
    };
    window.addEventListener('online', handleOnline);
    setupQueueListener();
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!userIdRef.current || !ready) return;
    const userId = userIdRef.current;
    const channel = supabase
      .channel('realtime-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
        },
        async (payload) => {
          console.log('📡 Mudança detectada no Supabase:', payload);
          try {
            await syncWithSupabase(userId);
            console.log('✅ Re-sincronização concluída após mudança em tempo real.');
          } catch (syncError) {
            console.warn('⚠️ Erro ao re-sincronizar em tempo real:', syncError);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Inscrição em tempo real estabelecida com sucesso.');
        } else {
          console.log(`🔄 Status da inscrição: ${status}`);
        }
      });
    return () => {
      console.log('🔌 Removendo inscrição em tempo real...');
      supabase.removeChannel(channel);
    };
  }, [ready]);

  // ============================================================
  // TELA DE CARREGAMENTO COM LOGO DO REVISARLASH
  // ============================================================
  if (!isLoaded || !ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LogoIcon size={56} className="animate-pulse" />
          <p className="text-sm text-foreground/55">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <LoadingProvider>
        <FlashcardProvider>
          <StudyProvider>
            <ErrorProvider>
              <RouterProvider router={router} />
            </ErrorProvider>
          </StudyProvider>
        </FlashcardProvider>
      </LoadingProvider>
    </ThemeProvider>
  );
}

const App = () => (
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    localization={ptBR}
    signInUrl="/login"
    signUpUrl="/cadastro"
    afterSignInUrl="/"
    afterSignUpUrl="/"
    __experimental_billing={{ enabled: true }}  // <-- ATIVA O BILLING
    appearance={{
      cssLayerName: 'clerk',
      variables: {
        colorPrimary: '#14B8A6',
        colorBackground: '#0F1A1F',
        colorText: '#FFFFFF',
        colorTextSecondary: '#C0C0D0',
        borderRadius: '0.75rem',
        fontFamily: 'DM Sans, sans-serif',
      },
      elements: {
        card: 'background: #1A2A30 !important; border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 1rem !important; padding: 2rem !important; width: 100% !important; max-width: 28rem !important; box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;',
        header: 'display: none !important;',
        headerTitle: 'display: none !important;',
        headerSubtitle: 'display: none !important;',
        formButtonPrimary: 'background: #14B8A6 !important; color: #FFFFFF !important; font-weight: 600 !important; padding: 0.625rem !important; width: 100% !important; border-radius: 0.5rem !important; transition: all 0.2s !important; border: none !important; cursor: pointer !important; font-size: 0.875rem !important;',
        formFieldInput: 'background: #0F1A1F !important; border: 1px solid #2A3A40 !important; padding: 0.625rem !important; border-radius: 0.5rem !important; color: #FFFFFF !important; width: 100% !important; outline: none !important; transition: all 0.2s !important; font-size: 0.875rem !important;',
        formFieldLabel: 'color: #FFFFFF !important; font-size: 0.875rem !important; font-weight: 500 !important; display: block !important; margin-bottom: 0.25rem !important;',
        identityPreview: 'color: #FFFFFF !important;',
        socialButtonsBlockButton: 'border: 1px solid #2A3A40 !important; background: #1A2A30 !important; border-radius: 0.5rem !important; color: #FFFFFF !important; font-size: 0.875rem !important; font-weight: 500 !important; transition: all 0.2s !important; padding: 0.5rem !important; width: 100% !important;',
        socialButtonsBlockButtonText: 'color: #FFFFFF !important;',
        footerActionLink: 'color: #14B8A6 !important; text-decoration: underline !important; font-weight: 500 !important; font-size: 0.875rem !important;',
        formFieldErrorText: 'color: #E53E3E !important; font-size: 0.75rem !important; margin-top: 0.25rem !important;',
        dividerLine: 'background: #2A3A40 !important; height: 1px !important;',
        dividerText: 'color: #8A86A8 !important; font-size: 0.75rem !important; padding: 0 0.5rem !important;',
        formFieldHintText: 'color: #8A86A8 !important; font-size: 0.75rem !important;',
        footer: 'color: #8A86A8 !important; font-size: 0.75rem !important; margin-top: 1rem !important; text-align: center !important;',
        root: 'color: #FFFFFF !important;',
        form: 'color: #FFFFFF !important;',
      },
    }}
  >
    <Root />
  </ClerkProvider>
);

const root = createRoot(document.getElementById('root')!);
root.render(<App />);